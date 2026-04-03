import { supabase } from "../../../shared/lib/supabase";
import type { User } from "../../auth/types";
import * as authRepo from "../../auth/repositories/auth-user.repository";
import * as repo from "../repositories/access.repository";
import type { AccessEvaluation, LocalAccessRecord, RemoteAccessRecord } from "../types";

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeAccessCode(value: string) {
    return value.trim().toUpperCase();
}

function missingTablesMessage(message: string) {
    return message.includes("user_accounts") ||
        message.includes("user_payments") ||
        message.includes("user_access_codes")
        ? "Las tablas remotas de acceso no existen todavia. Aplica database/manual/supabase-one-time/001_user_access_setup.sql en Supabase."
        : message;
}

function parseDate(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addOneExactYear(value: string) {
    const parsed = parseDate(value);
    if (!parsed) return "";
    const next = new Date(parsed);
    next.setFullYear(next.getFullYear() + 1);
    return next.toISOString();
}

function getStoredNextPaymentDate(local: LocalAccessRecord) {
    if (local.next_payment_date) return local.next_payment_date;
    if (local.last_payment_date) return addOneExactYear(local.last_payment_date);
    return "";
}

function isPaymentExpired(nextPaymentDate: string) {
    const parsed = parseDate(nextPaymentDate);
    if (!parsed) return true;
    return Date.now() >= parsed.getTime();
}

function hasRemoteVerifiedAccess(remote: RemoteAccessRecord) {
    return remote.account_active || Boolean(normalizeAccessCode(remote.access_code));
}

function baseResult(
    status: AccessEvaluation["status"],
    record: Pick<LocalAccessRecord, "access_code" | "last_payment_date" | "next_payment_date" | "last_access_date">,
    message: string,
    publicAccountId = "",
): AccessEvaluation {
    return {
        status,
        publicAccountId,
        accessCode: record.access_code,
        lastPaymentDate: record.last_payment_date,
        nextPaymentDate: record.next_payment_date,
        lastAccessDate: record.last_access_date,
        message,
    };
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
    return repo.findLocalAccessByUserId(userId);
}

async function writeLocalAccess(record: LocalAccessRecord): Promise<void> {
    await repo.upsertLocalAccess(record);
}

async function tryFetchRemotePaymentHint(user: User): Promise<Pick<RemoteAccessRecord, "public_user_id"> | null> {
    try {
        await syncRemoteAccessShell(user);
        const remote = await fetchRemoteAccess(user);
        return remote ? { public_user_id: remote.public_user_id } : null;
    } catch {
        return null;
    }
}

async function blockForClockDrift(
    local: LocalAccessRecord,
    publicAccountId = "",
): Promise<AccessEvaluation> {
    const blocked: LocalAccessRecord = {
        ...local,
        account_active: 0,
        blocked_reason: "clock_guard",
        updated_at: nowIso(),
    };
    await writeLocalAccess(blocked);
    return baseResult(
        "blocked",
        blocked,
        "La fecha actual no es mayor al ultimo acceso registrado. La app quedo bloqueada por seguridad.",
        publicAccountId,
    );
}

async function markPaymentRequired(
    user: User,
    local: LocalAccessRecord | null,
    message: string,
): Promise<AccessEvaluation> {
    const hint = await tryFetchRemotePaymentHint(user);
    const nextPaymentDate = local ? getStoredNextPaymentDate(local) : "";
    const record: LocalAccessRecord = local ?? {
        user_id: user.id,
        access_code: "",
        account_active: 0,
        last_payment_date: "",
        next_payment_date: nextPaymentDate,
        last_access_date: "",
        blocked_reason: "payment_required",
        updated_at: nowIso(),
    };

    const normalized: LocalAccessRecord = {
        ...record,
        account_active: 0,
        next_payment_date: nextPaymentDate,
        blocked_reason: "payment_required",
        updated_at: nowIso(),
    };
    await writeLocalAccess(normalized);

    return baseResult(
        "payment_required",
        normalized,
        message,
        hint?.public_user_id ?? "",
    );
}

async function grantStoredAccess(
    local: LocalAccessRecord,
    publicAccountId = "",
): Promise<AccessEvaluation> {
    const today = todayKey();
    if (local.last_access_date && today < local.last_access_date) {
        return blockForClockDrift(local, publicAccountId);
    }

    const granted: LocalAccessRecord = {
        ...local,
        account_active: 1,
        blocked_reason: "",
        last_access_date: today,
        next_payment_date: getStoredNextPaymentDate(local),
        updated_at: nowIso(),
    };
    await writeLocalAccess(granted);

    return baseResult(
        "granted",
        granted,
        "Acceso restaurado desde la sesion local.",
        publicAccountId,
    );
}

function resolvePaymentAnchor(remote: RemoteAccessRecord) {
    return remote.last_payment_date || remote.activated_at || nowIso();
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
    const local = await readLocalAccess(user.id);

    try {
        await syncRemoteAccessShell(user);
        const remote = await fetchRemoteAccess(user);
        if (remote && hasRemoteVerifiedAccess(remote)) {
            const remoteCode = normalizeAccessCode(remote.access_code);
            const paymentAnchor = resolvePaymentAnchor(remote);
            const lastPaymentDate = parseDate(paymentAnchor)?.toISOString() ?? nowIso();
            const nextPaymentDate = addOneExactYear(lastPaymentDate);
            const granted: LocalAccessRecord = {
                user_id: user.id,
                access_code: remoteCode,
                account_active: 1,
                last_payment_date: lastPaymentDate,
                next_payment_date: nextPaymentDate,
                last_access_date: todayKey(),
                blocked_reason: "",
                updated_at: nowIso(),
            };
            await writeLocalAccess(granted);

            return baseResult(
                "granted",
                granted,
                local?.access_code
                    ? "Acceso actualizado desde el estado remoto de esta cuenta."
                    : "Esta cuenta ya tenia un codigo activo. Restauramos el acceso automaticamente.",
                remote.public_user_id,
            );
        }
    } catch (error) {
        console.error("[access] failed to refresh remote access state:", error);
    }

    if (!local?.access_code) {
        return markPaymentRequired(
            user,
            local,
            "No encontramos un codigo verificado en este equipo. Inicia el flujo de pago y valida tu codigo.",
        );
    }

    const nextPaymentDate = getStoredNextPaymentDate(local);
    if (isPaymentExpired(nextPaymentDate)) {
        return markPaymentRequired(
            user,
            { ...local, next_payment_date: nextPaymentDate },
            "La licencia local vencio. Debes validar nuevamente tu pago con el codigo de acceso.",
        );
    }

    return grantStoredAccess({ ...local, next_payment_date: nextPaymentDate });
}

export async function unlockWithAccessCode(user: User, code: string): Promise<AccessEvaluation> {
    const normalizedCode = normalizeAccessCode(code);
    if (!normalizedCode) {
        throw new Error("Ingresa el codigo de acceso.");
    }

    await syncRemoteAccessShell(user);
    const remote = await fetchRemoteAccess(user);
    if (!remote) {
        throw new Error("No encontramos un registro remoto para esta cuenta.");
    }

    const remoteCode = normalizeAccessCode(remote.access_code);

    if (!remoteCode) {
        throw new Error("Todavia no hay un codigo asignado para esta cuenta.");
    }

    if (normalizedCode !== remoteCode) {
        throw new Error("El codigo ingresado no coincide.");
    }

    const paymentAnchor = resolvePaymentAnchor(remote);
    const lastPaymentDate = parseDate(paymentAnchor)?.toISOString() ?? nowIso();
    const nextPaymentDate = addOneExactYear(lastPaymentDate);

    const granted: LocalAccessRecord = {
        user_id: user.id,
        access_code: remoteCode,
        account_active: 1,
        last_payment_date: lastPaymentDate,
        next_payment_date: nextPaymentDate,
        last_access_date: todayKey(),
        blocked_reason: "",
        updated_at: nowIso(),
    };
    await writeLocalAccess(granted);

    return baseResult(
        "granted",
        granted,
        "Pago verificado correctamente y acceso guardado en este equipo.",
        remote.public_user_id,
    );
}
