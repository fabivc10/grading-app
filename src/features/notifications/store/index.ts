import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Notification } from "../types";

type NotificationsState = {
    notifications: Notification[];
    /** Tracks the last alert level sent per key: "p-{estId}-{asigId}" or "a-{estId}-{asigId}" */
    sentAlerts: Record<string, number>;
    add: (n: Omit<Notification, "id" | "read">) => void;
    upsertAlert: (alertKey: string, n: Omit<Notification, "id" | "read" | "alertKey">) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
    removeAlert: (alertKey: string) => void;
    clearRead: () => void;
    setSentAlert: (key: string, level: number) => void;
    clearSentAlert: (key: string) => void;
};

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set) => ({
            notifications: [],
            sentAlerts: {},
            add: (n) => set((s) => ({
                notifications: [{ ...n, id: crypto.randomUUID(), read: false }, ...s.notifications],
            })),
            upsertAlert: (alertKey, n) => set((s) => {
                const existing = s.notifications.find((item) => item.alertKey === alertKey);
                if (!existing) {
                    return {
                        notifications: [{ ...n, id: crypto.randomUUID(), read: false, alertKey }, ...s.notifications],
                    };
                }
                return {
                    notifications: s.notifications.map((item) =>
                        item.alertKey === alertKey ? { ...item, ...n, alertKey } : item
                    ),
                };
            }),
            markRead:    (id) => set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) })),
            markAllRead: ()   => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
            remove:      (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
            removeAlert: (alertKey) => set((s) => ({
                notifications: s.notifications.filter((n) => n.alertKey !== alertKey),
            })),
            clearRead:   ()   => set((s) => ({ notifications: s.notifications.filter((n) => !n.read) })),
            setSentAlert: (key, level) => set((s) => ({ sentAlerts: { ...s.sentAlerts, [key]: level } })),
            clearSentAlert: (key) => set((s) => {
                if (!(key in s.sentAlerts)) return s;
                const next = { ...s.sentAlerts };
                delete next[key];
                return { sentAlerts: next };
            }),
        }),
        { name: "grading-notifications" }
    )
);
