import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotifPriority = "alta" | "media" | "baja";

export type Notification = {
    id: string;
    text: string;
    time: string;
    priority: NotifPriority;
    read: boolean;
};

type NotificationsState = {
    notifications: Notification[];
    /** Tracks the last alert level sent per key: "p-{estId}-{asigId}" or "a-{estId}-{asigId}" */
    sentAlerts: Record<string, number>;
    add: (n: Omit<Notification, "id" | "read">) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
    clearRead: () => void;
    setSentAlert: (key: string, level: number) => void;
};

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set) => ({
            notifications: [],
            sentAlerts: {},
            add: (n) => set((s) => ({
                notifications: [{ ...n, id: crypto.randomUUID(), read: false }, ...s.notifications],
            })),
            markRead:    (id) => set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) })),
            markAllRead: ()   => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
            remove:      (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
            clearRead:   ()   => set((s) => ({ notifications: s.notifications.filter((n) => !n.read) })),
            setSentAlert: (key, level) => set((s) => ({ sentAlerts: { ...s.sentAlerts, [key]: level } })),
        }),
        { name: "grading-notifications" }
    )
);
