import "./admin.css";
import { AdminShell } from "./shell";

export const metadata = { title: "Cat Feeder admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
