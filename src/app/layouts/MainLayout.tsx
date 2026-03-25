import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import styles from "./MainLayout.module.css";

export function MainLayout() {
    return (
        <div className={styles.layout}>
            <div className={styles.sidebar}>
                <Sidebar />
            </div>

            <div className={styles.rightPane}>
                <Topbar />

                <main className={styles.main}>
                    <Outlet />
                </main>

                <Footer />
            </div>
        </div>
    );
}
