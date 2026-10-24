'use client';

import { createContext } from 'react';
import type { AppNavbarProps } from './AppNavbar';

export const NavbarRegistration = createContext<((props: AppNavbarProps) => void) | null>(null);

// Reloads the current page from the server while its navigation snapshot stays visible.
export const DashboardRefresh = createContext<(() => void) | null>(null);
