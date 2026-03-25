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
    add: (n: Omit<Notification, "id" | "read">) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
    clearRead: () => void;
};

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set) => ({
            notifications: [
                { id: "demo-1", text: "Carlos Pérez tiene nota total por debajo del umbral (62 pts)", time: "hace 5 min",  priority: "alta",  read: false },
                { id: "demo-2", text: "María López: cotidiano por debajo del 70%",                   time: "hace 20 min", priority: "media", read: false },
                { id: "demo-3", text: "Horario actualizado para el martes",                          time: "hace 1 h",    priority: "baja",  read: true  },
                { id: "demo-4", text: "Recordatorio: calificaciones por entregar",                   time: "ayer",        priority: "media", read: true  },
            ],
            add: (n) => set((s) => ({
                notifications: [{ ...n, id: crypto.randomUUID(), read: false }, ...s.notifications],
            })),
            markRead:    (id) => set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) })),
            markAllRead: ()   => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
            remove:      (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
            clearRead:   ()   => set((s) => ({ notifications: s.notifications.filter((n) => !n.read) })),
        }),
        { name: "grading-notifications" }
    )
);
