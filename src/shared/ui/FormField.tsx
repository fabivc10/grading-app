import { ReactNode } from "react";
import styles from "./FormField.module.css";

interface FormFieldProps {
    label: string;
    required?: boolean;
    children: ReactNode;
}

export function FormField({ label, required, children }: FormFieldProps) {
    return (
        <div className={styles.field}>
            <label className={styles.label}>
                {label}
                {required && <span className={styles.required}>*</span>}
            </label>
            {children}
        </div>
    );
}
