import { ReactNode } from "react";
import { EmptyIcon } from "./icons";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.icon}>{icon ?? <EmptyIcon />}</div>
            <p className={styles.title}>{title}</p>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
    );
}
