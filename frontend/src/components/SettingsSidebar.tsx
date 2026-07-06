import { NavLink } from "react-router-dom";

type NavLinkItem = {
  to: string;
  label: string;
};

type SettingsSidebarProps = {
  NAV_LINKS: NavLinkItem[];
};

export function SettingsSidebar({ NAV_LINKS }: SettingsSidebarProps) {
  return (
    <aside className="w-48 shrink-0">
      <nav className="w-full">
        <ul className="flex flex-col gap-1">
          {NAV_LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }: { isActive: boolean }) =>
                  `
                    flex items-center rounded-lg px-3 py-2
                    text-sm transition-colors
                    ${
                      isActive
                        ? "bg-surface-2 text-foreground font-medium"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }
                  `
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
