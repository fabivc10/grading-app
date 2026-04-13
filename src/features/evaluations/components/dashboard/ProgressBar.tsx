import { cx, clamp } from "./utils";

const TONE_CLASS = {
    green: "bg-emerald-400",
    yellow: "bg-amber-400",
    gray: "bg-zinc-500",
    violet: "bg-violet-400",
} as const;

export function ProgressBar({
    value,
    tone = "green",
}: {
    value: number;
    tone?: keyof typeof TONE_CLASS;
}) {
    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/90">
            <div
                className={cx("h-full rounded-full transition-[width] duration-300", TONE_CLASS[tone])}
                style={{ width: `${clamp(value, 0, 100)}%` }}
            />
        </div>
    );
}

export default ProgressBar;
