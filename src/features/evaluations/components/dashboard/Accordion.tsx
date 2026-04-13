import { ReactNode, useState } from "react";
import { cx } from "./utils";

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={cx("h-4 w-4 text-zinc-500 transition-transform duration-200", open && "rotate-90 text-zinc-200")}>
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function Accordion({
    header,
    children,
    defaultOpen = false,
    className,
    bodyClassName,
}: {
    header: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    className?: string;
    bodyClassName?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={cx("rounded-2xl bg-zinc-950/80", className)}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/60">
                <Chevron open={open} />
                {header}
            </button>
            {open && <div className={cx("px-2 pb-2", bodyClassName)}>{children}</div>}
        </div>
    );
}

export default Accordion;
