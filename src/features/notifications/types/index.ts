export type NotifPriority = "alta" | "media" | "baja";

export type Notification = {
    id: string;
    text: string;
    time: string;
    priority: NotifPriority;
    read: boolean;
    alertKey?: string;
};
