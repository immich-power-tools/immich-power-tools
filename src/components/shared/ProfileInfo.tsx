import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useConfig } from "@/contexts/ConfigContext";
import { logoutUser } from "@/handlers/api/user.handler";
import { useCurrentUser } from "@/contexts/CurrentUserContext";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HandshakeIcon, Server, Globe, LogOut, Moon, Sun, User, Settings } from "lucide-react";
import { useRouter } from "next/router";

export default function ProfileInfo() {
  const { updateContext, ...user } = useCurrentUser();
  const { immichURL, exImmichUrl, version } = useConfig();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const handleLogout = () =>
    logoutUser()
      .then(() => updateContext(null))
      .catch((error) => {
        toast.error(error.message);
      });

  return (
    <>
      {/* Connection info */}
      <div className="border-t px-3 py-2 space-y-1">
        <Tooltip content={`External: ${exImmichUrl}`}>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" />
            <Link href={exImmichUrl} target="_blank" className="font-mono truncate hover:text-foreground transition-colors">
              {exImmichUrl}
            </Link>
          </div>
        </Tooltip>
        <Tooltip content={`Internal: ${immichURL}`}>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Server className="h-3 w-3 shrink-0" />
            <Link href={immichURL} target="_blank" className="font-mono truncate hover:text-foreground transition-colors">
              {immichURL}
            </Link>
          </div>
        </Tooltip>
      </div>

      {/* User dropdown */}
      {user && (
        <div className="border-t px-2 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="cursor-pointer">
                {theme === "light" ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="https://buymeacoffee.com/varunraj" target="_blank">
                  <HandshakeIcon className="h-4 w-4 mr-2" />
                  Support
                </Link>
              </DropdownMenuItem>
              {!user.isUsingAPIKey && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Log Out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Footer */}
      <div className="border-t text-muted-foreground text-[10px] py-1.5 flex justify-between items-center px-3">
        <p>
          Made with <span className="text-red-500">&hearts;</span> by{" "}
          <Link target="_blank" href="https://x.com/zathvarun" className="text-primary">
            @zathvarun
          </Link>
        </p>
        <Link target="_blank" href={`https://github.com/varun-raj/immich-power-tools/releases/tag/v${version}`} className="font-mono">
          v{version}
        </Link>
      </div>
    </>
  );
}
