export type RemoteAccessRecord = {
    auth_user_uuid: string;
    local_user_id: number | null;
    user_email: string;
    full_name: string;
    public_user_id: string;
    access_code: string;
    code_generated_at?: string | null;
    account_active: boolean;
    last_payment_date: string | null;
    activated_at: string | null;
    updated_at: string;
};

export type LocalAccessRecord = {
    user_id: number;
    access_code: string;
    account_active: number;
    last_payment_date: string;
    next_payment_date: string;
    last_access_date: string;
    blocked_reason: string;
    updated_at: string;
};

export type AccessEvaluation =
    | {
        status: "granted";
        publicAccountId: string;
        accessCode: string;
        lastPaymentDate: string;
        nextPaymentDate: string;
        lastAccessDate: string;
        message: string;
    }
    | {
        status: "payment_required" | "blocked";
        publicAccountId: string;
        accessCode: string;
        lastPaymentDate: string;
        nextPaymentDate: string;
        lastAccessDate: string;
        message: string;
    };
