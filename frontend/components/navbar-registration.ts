'use client';

import { createContext } from 'react';
import type { AppNavbarProps } from './AppNavbar';

export const NavbarRegistration = createContext<((props: AppNavbarProps) => void) | null>(null);
