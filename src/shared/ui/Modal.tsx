import { ReactNode } from "react";
import { CloseIcon } from "./icons";
import styles from "./Modal.module.css";

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
    if (!open) return null;
    return (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`${styles.card} ${className ?? ""}`}>
                <div className={styles.header}>
                    <span className={styles.title}>{title}</span>
                    <button className={styles.closeBtn} onClick={onClose} type="button">
                        <CloseIcon />
                    </button>
                </div>
                <div className={styles.body}>{children}</div>
                {footer && <div className={styles.footer}>{footer}</div>}
            </div>
        </div>
    );
}
