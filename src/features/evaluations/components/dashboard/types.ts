import type { EvalCategory, StudentEval } from "../../types";

export type DashboardCategoryConfig = {
    key: EvalCategory;
    label: string;
    maxPoints: number;
};

export type DashboardScoreChange = {
    category: EvalCategory;
    entryId: string;
    itemId: string;
    score: number;
};

export type DashboardNoteChange = {
    category: EvalCategory;
    entryId: string;
    itemId: string;
    note: string;
};

export type TeacherGradingDashboardProps = {
    student: StudentEval;
    categories?: DashboardCategoryConfig[];
    onItemScoreChange?: (args: DashboardScoreChange) => void;
    onItemNoteChange?: (args: DashboardNoteChange) => void;
};
