import { CloseIcon, SearchIcon } from "./icons";
import styles from "./SearchInput.module.css";

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    width?: string | number;
    className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Buscar...", width = 220, className }: SearchInputProps) {
    const style = typeof width === "number" ? { width: `${width}px` } : { width };
    return (
        <div className={`${styles.wrap}${className ? ` ${className}` : ""}`} style={style}>
            <span className={styles.icon}><SearchIcon /></span>
            <input
                className={styles.input}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {value.length > 0 && (
                <button className={styles.clear} type="button" onClick={() => onChange("")} aria-label={"Limpiar b\u00fasqueda"}>
                    <CloseIcon />
                </button>
            )}
        </div>
    );
}
