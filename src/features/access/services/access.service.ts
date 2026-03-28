import { ACCESS_GUARD_KEY } from "../../../shared/constants";
import { supabase } from "../../../shared/lib/supabase";
import type { User } from "../../auth/types";
import * as authRepo from "../../auth/repositories/auth-user.repository";
import * as repo from "../repositories/access.repository";
import type { AccessEvaluation, LocalAccessRecord, RemoteAccessRecord } from "../types";

type BrowserAccessCache = Record<number, LocalAccessRecord>;

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function nowIso() {
    return new Date().toISOString();
}

function isAccessCodeExpired(codeGeneratedAt?: string | null) {
    if (!codeGeneratedAt) return true;
    const generatedAtMs = Date.parse(codeGeneratedAt);
    if (Number.isNaN(generatedAtMs)) return true;
    return Date.now() - generatedAtMs >= 24 * 60 * 60 * 1000;
}

function generateAccessCode() {
    const seed = Math.random().toString(36).slice(2).toUpperCase();
    return `ACC-${seed.slice(0, 4)}-${seed.slice(4, 8)}`;
}

function readBrowserCache(): BrowserAccessCache {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(ACCESS_GUARD_KEY);
        return raw ? JSON.parse(raw) as BrowserAccessCache : {};
    } catch {
        return {};
    }
}

function writeBrowserCache(cache: BrowserAccessCache) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCESS_GUARD_KEY, JSON.stringify(cache));
}

function getSessionGrantKey(userId: number) {
    return `${ACCESS_GUARD_KEY}:session:${userId}`;
}

function readSessionGrant(userId: number) {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(getSessionGrantKey(userId)) ?? "";
}

function writeSessionGrant(userId: number, value: string) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(getSessionGrantKey(userId), value);
}

function missingTablesMessage(message: string) {
    return message.includes("user_accounts") ||
        message.includes("user_payments") ||
        message.includes("user_access_codes")
        ? "Las tablas remotas de acceso no existen todavia. Aplica database/manual/supabase-one-time/001_user_access_setup.sql en Supabase."
        : message;
}

async function getRemoteIdentity(user: User) {
    const localUser = await authRepo.findUserById(user.id);
    const authUserUuid = localUser?.external_auth_id;
    if (!authUserUuid) {
        throw new Error("No encontramos el UUID remoto de Supabase para esta cuenta.");
    }

    return {
        authUserUuid,
        email: localUser?.email ?? user.email,
        name: localUser?.name ?? user.name,
    };
}

async function readLocalAccess(userId: number): Promise<LocalAccessRecord | null> {
    try {
        return await repo.findLocalAccessByUserId(userId);
    } catch {
        return readBrowserCache()[userId] ?? null;
    }
}

async function writeLocalAccess(record: LocalAccessRecord): Promise<void> {
    try {
        await repo.upsertLocalAccess(record);
    } catch {
        const cache = readBrowserCache();
        cache[record.user_id] = record;
        writeBrowserCache(cache);
    }
}

async function reconcileRemoteAccessState(remote: RemoteAccessRecord): Promise<RemoteAccessRecord> {
    const currentCode = remote.access_code?.trim() ?? "";
    const shouldRotateCode = !currentCode || isAccessCodeExpired(remote.code_generated_at);
    const nextCode = shouldRotateCode ? generateAccessCode() : currentCode;
    const shouldUpdateCode = shouldRotateCode && nextCode !== currentCode;
    const nextCodeGeneratedAt = shouldUpdateCode ? nowIso() : null;
    const nextActivatedAt = remote.account_active
        ? (remote.activated_at ?? nowIso())
        : remote.activated_at;
    const shouldUpdateActivation = remote.account_active && nextActivatedAt !== remote.activated_at;

    if (!shouldUpdateCode && !shouldUpdateActivation) {
        return remote;
    }

    const updates = await Promise.all([
        shouldUpdateCode
            ? supabase.from("user_access_codes").upsert({
                auth_user_uuid: remote.auth_user_uuid,
                access_code: nextCode,
                code_generated_at: nextCodeGeneratedAt,
            })
            : Promise.resolve({ error: null }),
        shouldUpdateActivation
            ? supabase.from("user_payments").upsert({
                auth_user_uuid: remote.auth_user_uuid,
                account_active: true,
                activated_at: nextActivatedAt,
            })
            : Promise.resolve({ error: null }),
    ]);

    const codeError = updates[0].error;
    const paymentError = updates[1].error;

    if (codeError) {
        throw new Error(missingTablesMessage(codeError.message));
    }

    if (paymentError) {
        throw new Error(missingTablesMessage(paymentError.message));
    }

    return {
        ...remote,
        access_code: nextCode,
        code_generated_at: nextCodeGeneratedAt,
        activated_at: nextActivatedAt,
        updated_at: nowIso(),
    };
}

async function activateRemoteAccount(remote: RemoteAccessRecord): Promise<RemoteAccessRecord> {
    if (remote.account_active) {
        return remote;
    }

    const activatedAt = nowIso();
    const { error } = await supabase.from("user_payments").upsert({
        auth_user_uuid: remote.auth_user_uuid,
        account_active: true,
        activated_at: activatedAt,
    });

    if (error) {
        throw new Error(missingTablesMessage(error.message));
    }

    return {
        ...remote,
        account_active: true,
        activated_at: activatedAt,
        updated_at: activatedAt,
    };
}

async function grantAccess(user: User, remote: RemoteAccessRecord, lastAccessDate: string): Promise<AccessEvaluation> {
    const today = todayKey();

    if (lastAccessDate && today < lastAccessDate) {
        const blocked: LocalAccessRecord = {
            user_id: user.id,
            access_code: remote.access_code ?? "",
            account_active: 0,
            last_payment_date: remote.last_payment_date ?? "",
            last_access_date: lastAccessDate,
            blocked_reason: "clock_guard",
            updated_at: nowIso(),
        };
        await writeLocalAccess(blocked);
        return {
            status: "blocked",
            publicAccountId: remote.public_user_id,
            accessCode: blocked.access_code,
            lastPaymentDate: blocked.last_payment_date,
            lastAccessDate: blocked.last_access_date,
            message: "La fecha actual no es mayor al ultimo acceso registrado. La app quedo bloqueada por seguridad.",
        };
    }

    const granted: LocalAccessRecord = {
        user_id: user.id,
        access_code: remote.access_code ?? "",
        account_active: 1,
        last_payment_date: remote.last_payment_date ?? "",
        last_access_date: today,
        blocked_reason: "",
        updated_at: nowIso(),
    };
    await writeLocalAccess(granted);
    writeSessionGrant(user.id, today);

    return {
        status: "granted",
        publicAccountId: remote.public_user_id,
        accessCode: granted.access_code,
        lastPaymentDate: granted.last_payment_date,
        lastAccessDate: granted.last_access_date,
        message: "Acceso validado correctamente.",
    };
}

export async function fetchRemoteAccess(user: User): Promise<RemoteAccessRecord | null> {
    const identity = await getRemoteIdentity(user);

    const [accountResult, billingResult, codeResult] = await Promise.all([
        supabase
            .from("user_accounts")
            .select("auth_user_uuid, local_user_id, user_email, full_name, public_user_id, updated_at")
            .eq("auth_user_uuid", identity.authUserUuid)
            .maybeSingle(),
        supabase
            .from("user_payments")
            .select("account_active, last_payment_date, activated_at, updated_at")
            .eq("auth_user_uuid", identity.authUserUuid)
            .maybeSingle(),
        supabase
            .from("user_access_codes")
            .select("access_code, code_generated_at, updated_at")
            .eq("auth_user_uuid", identity.authUserUuid)
            .maybeSingle(),
    ]);

    if (accountResult.error) {
        throw new Error(missingTablesMessage(accountResult.error.message));
    }

    if (billingResult.error) {
        throw new Error(missingTablesMessage(billingResult.error.message));
    }

    if (codeResult.error) {
        throw new Error(missingTablesMessage(codeResult.error.message));
    }

    if (!accountResult.data) {
        return null;
    }

    return {
        auth_user_uuid: accountResult.data.auth_user_uuid,
        local_user_id: accountResult.data.local_user_id,
        user_email: accountResult.data.user_email,
        full_name: accountResult.data.full_name,
        public_user_id: accountResult.data.public_user_id,
        access_code: codeResult.data?.access_code ?? "",
        code_generated_at: codeResult.data?.code_generated_at ?? null,
        account_active: billingResult.data?.account_active ?? false,
        last_payment_date: billingResult.data?.last_payment_date ?? null,
        activated_at: billingResult.data?.activated_at ?? null,
        updated_at: [
            accountResult.data.updated_at,
            billingResult.data?.updated_at,
            codeResult.data?.updated_at,
        ].find(Boolean) ?? nowIso(),
    };
}

export async function syncRemoteAccessShell(user: User): Promise<void> {
    const identity = await getRemoteIdentity(user);

    const { error: accountError } = await supabase.from("user_accounts").upsert({
        auth_user_uuid: identity.authUserUuid,
        local_user_id: user.id,
        user_email: identity.email,
        full_name: identity.name,
    });

    if (accountError) {
        throw new Error(missingTablesMessage(accountError.message));
    }

    const { error: billingError } = await supabase.from("user_payments").upsert({
        auth_user_uuid: identity.authUserUuid,
    });

    if (billingError) {
        throw new Error(missingTablesMessage(billingError.message));
    }

    const { error: codeError } = await supabase.from("user_access_codes").upsert({
        auth_user_uuid: identity.authUserUuid,
    });

    if (codeError) {
        throw new Error(missingTablesMessage(codeError.message));
    }
}

export async function evaluateAccess(user: User): Promise<AccessEvaluation> {
    await syncRemoteAccessShell(user);
    const remote = await fetchRemoteAccess(user);
    const today = todayKey();
    const local = await readLocalAccess(user.id);

    const normalizedRemote = remote ? await reconcileRemoteAccessState(remote) : null;

    if (!normalizedRemote?.account_active) {
        const record: LocalAccessRecord = {
            user_id: user.id,
            access_code: normalizedRemote?.access_code ?? "",
            account_active: 0,
            last_payment_date: normalizedRemote?.last_payment_date ?? "",
            last_access_date: "",
            blocked_reason: "payment_required",
            updated_at: nowIso(),
        };
        await writeLocalAccess(record);
        return {
            status: "payment_required",
            publicAccountId: normalizedRemote?.public_user_id ?? "",
            accessCode: record.access_code,
            lastPaymentDate: record.last_payment_date,
            lastAccessDate: record.last_access_date,
            message: "La cuenta no tiene un pago activo registrado.",
        };
    }

    if ((local?.access_code ?? "") !== (normalizedRemote.access_code ?? "")) {
        return {
            status: "payment_required",
            publicAccountId: normalizedRemote.public_user_id,
            accessCode: "",
            lastPaymentDate: normalizedRemote.last_payment_date ?? "",
            lastAccessDate: local?.last_access_date ?? "",
            message: "Ingresa el codigo de acceso que recibiste para habilitar esta cuenta en este equipo.",
        };
    }

    const lastAccessDate = local?.last_access_date ?? "";
    const currentSessionGrant = readSessionGrant(user.id);

    if (currentSessionGrant === today && lastAccessDate === today) {
        return {
            status: "granted",
            publicAccountId: normalizedRemote.public_user_id,
            accessCode: local?.access_code ?? normalizedRemote.access_code ?? "",
            lastPaymentDate: local?.last_payment_date ?? normalizedRemote.last_payment_date ?? "",
            lastAccessDate,
            message: "Acceso validado correctamente.",
        };
    }

    return grantAccess(user, normalizedRemote, lastAccessDate);
}

export async function unlockWithAccessCode(user: User, code: string): Promise<AccessEvaluation> {
    await syncRemoteAccessShell(user);
    const remote = await fetchRemoteAccess(user);
    const normalizedCode = code.trim();
    const normalizedRemote = remote ? await reconcileRemoteAccessState(remote) : null;
    if (!normalizedCode) {
        throw new Error("Ingresa el codigo de acceso.");
    }
    if (!normalizedRemote) {
        throw new Error("No encontramos un registro remoto para esta cuenta.");
    }
    if (!normalizedRemote.access_code) {
        throw new Error("Todavia no hay un codigo asignado para esta cuenta.");
    }
    if (normalizedCode !== normalizedRemote.access_code.trim()) {
        throw new Error("El codigo ingresado no coincide.");
    }

    const activeRemote = await activateRemoteAccount(normalizedRemote);
    const local = await readLocalAccess(user.id);
    return grantAccess(user, activeRemote, local?.last_access_date ?? "");
}
