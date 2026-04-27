'use client';

import { useEffect, useMemo, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CalendarDays,
  Clock3,
  LocateFixed,
  MapPin,
  Monitor,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  attendanceAPI,
  projectsAPI,
  setAuthToken,
  type AttendanceAudienceScope,
  type AttendanceEventCategory,
  type AttendanceEvent,
  type AttendanceLocationType,
} from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';

type ProjectOption = {
  id: string;
  name: string;
};

type AttendanceRosterRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  present: boolean;
  verificationMethod: 'GEOFENCE' | 'CODE';
  codeVerified: boolean;
  checkedInAt: string;
};

type LocationSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

const CHAMPAIGN_URBANA_VIEWBOX = '-88.3350,40.1600,-88.1750,40.0600';
const CHAMPAIGN_URBANA_PROXIMITY = '-88.2434,40.1164';

type CreateFormState = {
  title: string;
  eventDate: string;
  locationType: AttendanceLocationType;
  locationLabel: string;
  audienceScope: AttendanceAudienceScope;
  category: AttendanceEventCategory;
  projectId: string;
};

const DEFAULT_FORM: CreateFormState = {
  title: '',
  eventDate: '',
  locationType: 'ONLINE',
  locationLabel: '',
  audienceScope: 'TEAM',
  category: 'TEAM_MEETING',
  projectId: '',
};

const ATTENDANCE_CATEGORY_LABELS: Record<AttendanceEventCategory, string> = {
  CLIENT_CALL: 'Client call',
  TEAM_MEETING: 'Team meeting',
  FIRMWIDE_EVENT: 'Firmwide event',
  SOCIAL: 'Social',
};

const TEAM_EVENT_CATEGORIES: AttendanceEventCategory[] = ['CLIENT_CALL', 'TEAM_MEETING'];
const FIRMWIDE_EVENT_CATEGORIES: AttendanceEventCategory[] = ['FIRMWIDE_EVENT', 'SOCIAL'];

function getAllowedCategoriesForScope(scope: AttendanceAudienceScope): AttendanceEventCategory[] {
  return scope === 'TEAM' ? TEAM_EVENT_CATEGORIES : FIRMWIDE_EVENT_CATEGORIES;
}

function getDefaultCategoryForScope(scope: AttendanceAudienceScope): AttendanceEventCategory {
  return scope === 'TEAM' ? 'TEAM_MEETING' : 'FIRMWIDE_EVENT';
}

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function readCurrentPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function formatGeolocationError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = Number((err as { code?: unknown }).code);
    if (code === 1) return 'Location access is blocked. Enable location permission for this browser and try again.';
    if (code === 2) return 'Your device could not determine its location. Move to an open area, confirm Location Services are on, and try again.';
    if (code === 3) return 'Location lookup timed out. Try again after your device has a stronger location fix.';
  }

  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message.includes('kCLErrorLocationUnknown')) {
    return 'Your device reported a temporary location failure. Wait a few seconds for GPS to settle, then try again.';
  }

  return 'Unable to read your current location right now. Try again in a moment.';
}

async function getBrowserLocation(): Promise<GeolocationPosition> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not available in this browser.');
  }

  try {
    return await readCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  } catch (err) {
    try {
      return await readCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
      });
    } catch (retryErr) {
      throw new Error(formatGeolocationError(retryErr ?? err));
    }
  }
}

function formatCountdown(target: string | null, nowMs: number) {
  if (!target) return null;
  const diffMs = new Date(target).getTime() - nowMs;
  if (diffMs <= 0) return 'Closed';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} remaining`;
}

function formatAvailabilitySlotLabel(start: string, end: string) {
  return `${new Date(start).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} - ${new Date(end).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatAvailabilityDayLabel(value: string) {
  return new Date(value).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatAvailabilityTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getAvailabilityDayKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAvailabilityHeatColor(availableCount: number, teamSize: number, isSelected: boolean) {
  if (teamSize <= 0) {
    return isSelected ? 'rgba(34, 197, 94, 0.28)' : '#ffffff';
  }

  const intensity = Math.max(0, Math.min(1, availableCount / teamSize));
  const green = { r: 34, g: 197, b: 94 };
  const white = { r: 255, g: 255, b: 255 };
  const mix = (start: number, end: number) => Math.round(start + (end - start) * intensity);
  const borderBoost = isSelected ? 16 : 0;
  const r = Math.max(0, mix(white.r, green.r) - borderBoost);
  const g = Math.max(0, mix(white.g, green.g) - borderBoost);
  const b = Math.max(0, mix(white.b, green.b) - borderBoost);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function AttendancePage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateFormState>(DEFAULT_FORM);
  const [resolvedLocation, setResolvedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationResolvedFor, setLocationResolvedFor] = useState('');
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  const [submittingEventId, setSubmittingEventId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterEventTitle, setRosterEventTitle] = useState('');
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [availabilitySelections, setAvailabilitySelections] = useState<Record<string, string[]>>({});
  const [availabilityDragState, setAvailabilityDragState] = useState<{
    eventId: string;
    mode: 'add' | 'remove';
  } | null>(null);

  const canCreate = role === 'ADMIN' || role === 'PM' || role === 'PARTNER' || role === 'EXECUTIVE';

  const syncData = async () => {
    if (!session.isLoggedIn || !session.user?.email) return;
    setLoading(true);

    try {
      const token = await session.getToken();
      const email = session.user.email;
      setAuthToken(token || email || null);

      const resolvedRole = await getEffectiveRole(token, email);
      setRole(resolvedRole);

      const [eventsRes, projectsRes] = await Promise.all([
        attendanceAPI.listEvents(),
        resolvedRole === 'ADMIN' || resolvedRole === 'PM' || resolvedRole === 'PARTNER' || resolvedRole === 'EXECUTIVE'
          ? projectsAPI.getAll({ limit: 100 })
          : Promise.resolve({ data: { projects: [] } }),
      ]);

      const eventItems = Array.isArray(eventsRes.data?.events) ? (eventsRes.data.events as AttendanceEvent[]).filter(event => !event.availabilityPoll?.enabled) : [];
      const projectItems = Array.isArray(projectsRes.data?.projects)
        ? (projectsRes.data.projects as Array<{ id: string; name: string }>).map((project) => ({
            id: project.id,
            name: project.name,
          }))
        : [];

      setEvents(eventItems);
      setProjects(projectItems);
      setForm((current) => {
        if (resolvedRole === 'PM') {
          return {
            ...current,
            audienceScope: 'TEAM',
            projectId: current.projectId || projectItems[0]?.id || '',
          };
        }
        return current;
      });
    } catch (err: any) {
      const parsed = parseApiError(err, 'Failed to load attendance events.');
      setError(
        err?.response?.status === 500
          ? `${parsed} The attendance backend likely still needs the new Prisma attendance tables applied.`
          : parsed,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void syncData();
  }, [session.isLoggedIn, session.user?.email]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const clearDragState = () => setAvailabilityDragState(null);
    window.addEventListener('pointerup', clearDragState);
    return () => window.removeEventListener('pointerup', clearDragState);
  }, []);

  useEffect(() => {
    setAvailabilitySelections((current) => {
      const next = { ...current };
      for (const attendanceEvent of events) {
        if (attendanceEvent.availabilityPoll) {
          next[attendanceEvent.id] = current[attendanceEvent.id] ?? attendanceEvent.availabilityPoll.currentUserSlots;
        } else {
          delete next[attendanceEvent.id];
        }
      }
      return next;
    });
  }, [events]);

  useEffect(() => {
    if (form.locationType !== 'IN_PERSON') {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    const query = form.locationLabel.trim();
    if (query.length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const searchLocations = async () => {
        setResolvingLocation(true);
        try {
          const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
          if (!apiKey) {
            throw new Error('Missing NEXT_PUBLIC_GEOAPIFY_API_KEY for location search.');
          }

          const fetchSuggestions = async (applyLocalBias: boolean) => {
            const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
            url.searchParams.set('text', query);
            url.searchParams.set('format', 'json');
            url.searchParams.set('limit', '8');
            url.searchParams.set('lang', 'en');
            if (applyLocalBias) {
              url.searchParams.set('filter', `rect:${CHAMPAIGN_URBANA_VIEWBOX}`);
              url.searchParams.set('bias', `proximity:${CHAMPAIGN_URBANA_PROXIMITY}`);
            }
            url.searchParams.set('apiKey', apiKey);

            const response = await fetch(url.toString(), {
              headers: {
                Accept: 'application/json',
              },
            });

            if (!response.ok) {
              throw new Error('Unable to look up that address right now.');
            }

            return (await response.json()) as {
              results?: Array<{
                place_id?: string;
                formatted?: string;
                address_line1?: string;
                address_line2?: string;
                lat?: number;
                lon?: number;
                result_type?: string;
                rank?: {
                  confidence?: number;
                  confidence_building_level?: number;
                };
              }>;
            };
          };

          const preferredResults = await fetchSuggestions(true);
          const results =
            (preferredResults.results?.length ?? 0) > 0
              ? preferredResults
              : await fetchSuggestions(false);

          const suggestions = (results.results ?? [])
            .map((item) => {
              const formatted = String(item.formatted ?? '').trim();
              const primary = String(item.address_line1 ?? '').trim();
              const secondary = String(item.address_line2 ?? '').trim();
              const label = formatted || [primary, secondary].filter(Boolean).join(', ');
              return {
                id: String(item.place_id ?? formatted),
                label,
                latitude: typeof item.lat === 'number' ? item.lat : NaN,
                longitude: typeof item.lon === 'number' ? item.lon : NaN,
                resultType: String(item.result_type ?? ''),
                confidence: item.rank?.confidence_building_level ?? item.rank?.confidence ?? 0,
              };
            })
            .filter((item) => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
            .sort((a, b) => {
              const aBuilding = a.resultType === 'building' || a.resultType === 'amenity' ? 1 : 0;
              const bBuilding = b.resultType === 'building' || b.resultType === 'amenity' ? 1 : 0;
              if (aBuilding !== bBuilding) return bBuilding - aBuilding;
              return b.confidence - a.confidence;
            })
            .map(({ id, label, latitude, longitude }) => ({
              id,
              label,
              latitude,
              longitude,
            }));

          setError(null);
          setLocationSuggestions(suggestions);
          setShowLocationSuggestions(suggestions.length > 0);
        } catch (err: any) {
          setLocationSuggestions([]);
          setShowLocationSuggestions(false);
          setError(parseApiError(err, 'Unable to look up that address right now.'));
        } finally {
          setResolvingLocation(false);
        }
      };

      void searchLocations();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [form.locationLabel, form.locationType]);

  const upcomingEvents = events.filter((event) => new Date(event.eventDate).getTime() >= nowMs).sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
  );
  const pastEvents = events.filter((event) => new Date(event.eventDate).getTime() < nowMs).sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
  );

  const eventCounts = useMemo(
    () => ({
      total: events.length,
      checkedIn: events.filter((event) => event.attendance?.present).length,
      managed: events.filter((event) => event.canManage).length,
    }),
    [events],
  );

  if (session.loading || !session.isLoggedIn || loading) {
    return <FullScreenLoader />;
  }

  const handleFormChange = (field: keyof CreateFormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'audienceScope') {
        const allowedCategories = getAllowedCategoriesForScope(value as AttendanceAudienceScope);
        next.category = allowedCategories.includes(current.category)
          ? current.category
          : getDefaultCategoryForScope(value as AttendanceAudienceScope);
      }
      return next;
    });
    if (field === 'locationLabel') {
      setResolvedLocation(null);
      setLocationResolvedFor('');
      setShowLocationSuggestions(true);
    }
  };

  const resetForm = () => {
    setForm({
      ...DEFAULT_FORM,
      audienceScope: role === 'PM' ? 'TEAM' : 'TEAM',
      category: getDefaultCategoryForScope('TEAM'),
      projectId: role === 'PM' ? projects[0]?.id || '' : '',
    });
    setResolvedLocation(null);
    setLocationResolvedFor('');
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const resolveLocation = async () => {
    const query = form.locationLabel.trim();
    if (!query) {
      throw new Error('Select an event location first.');
    }

    if (resolvedLocation && locationResolvedFor === query) {
      return resolvedLocation;
    }

    throw new Error('Choose a suggested location from the dropdown so the event can use the correct coordinates.');
  };

  const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      const locationCoordinates =
        form.locationType === 'IN_PERSON'
          ? locationResolvedFor === form.locationLabel.trim() && resolvedLocation
            ? resolvedLocation
            : await resolveLocation()
          : null;

      const payload = {
        title: form.title.trim(),
        eventDate: new Date(form.eventDate).toISOString(),
        locationType: form.locationType,
        category: form.category,
        locationLabel: form.locationType === 'IN_PERSON' ? form.locationLabel.trim() : undefined,
        latitude: form.locationType === 'IN_PERSON' ? locationCoordinates?.latitude : undefined,
        longitude: form.locationType === 'IN_PERSON' ? locationCoordinates?.longitude : undefined,
        geofenceRadiusMeters: form.locationType === 'IN_PERSON' ? 150 : undefined,
        audienceScope: role === 'PM' ? 'TEAM' : form.audienceScope,
        projectId: (role === 'PM' || form.audienceScope === 'TEAM') ? form.projectId : undefined,
      } as const;

      const response = await attendanceAPI.createEvent(payload);
      const created = response.data as AttendanceEvent;
      setEvents((current) => [...current, created].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()));
      setCreateOpen(false);
      resetForm();
      setMessage(
        created.locationType === 'ONLINE' && created.canControlOnlineCode && created.verificationCode
          ? `Event created. Online verification code: ${created.verificationCode}.`
          : 'Attendance event created.',
      );
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to create attendance event.'));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenCodeWindow = async (attendanceEvent: AttendanceEvent) => {
    setSubmittingEventId(attendanceEvent.id);
    setMessage(null);
    setError(null);

    try {
      const response = await attendanceAPI.openCodeWindow(attendanceEvent.id);
      const updated = response.data as AttendanceEvent;
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Code window opened for ${attendanceEvent.title}. It will stay open for 2 minutes.`);
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to open the code window.'));
    } finally {
      setSubmittingEventId(null);
    }
  };

  const handleDeleteEvent = async (attendanceEvent: AttendanceEvent) => {
    const confirmed = window.confirm(`Delete "${attendanceEvent.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setSubmittingEventId(attendanceEvent.id);
    setMessage(null);
    setError(null);

    try {
      await attendanceAPI.deleteEvent(attendanceEvent.id);
      setEvents((current) => current.filter((item) => item.id !== attendanceEvent.id));
      setMessage(`Deleted ${attendanceEvent.title}.`);
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to delete attendance event.'));
    } finally {
      setSubmittingEventId(null);
    }
  };

  const handleOnlineCheckIn = async (attendanceEvent: AttendanceEvent) => {
    const code = codeInputs[attendanceEvent.id]?.trim() || '';
    if (!code) {
      setError('Enter the 4-digit attendance code first.');
      return;
    }

    setSubmittingEventId(attendanceEvent.id);
    setMessage(null);
    setError(null);

    try {
      const response = await attendanceAPI.checkIn(attendanceEvent.id, {
        method: 'CODE',
        code,
      });
      const attendance = response.data?.attendance;
      setEvents((current) =>
        current.map((item) =>
          item.id === attendanceEvent.id
            ? { ...item, attendance }
            : item,
        ),
      );
      setCodeInputs((current) => ({ ...current, [attendanceEvent.id]: '' }));
      setMessage(`Checked in to ${attendanceEvent.title}.`);
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to submit online attendance.'));
    } finally {
      setSubmittingEventId(null);
    }
  };

  const handleInPersonCheckIn = async (attendanceEvent: AttendanceEvent) => {
    if (attendanceEvent.latitude == null || attendanceEvent.longitude == null) {
      setError('This event is missing geofence coordinates.');
      return;
    }

    setSubmittingEventId(attendanceEvent.id);
    setMessage(null);
    setError(null);

    try {
      const position = await getBrowserLocation();
      const distance = getDistanceInMeters(
        position.coords.latitude,
        position.coords.longitude,
        attendanceEvent.latitude,
        attendanceEvent.longitude,
      );

      if (distance > attendanceEvent.geofenceRadiusMeters) {
        throw new Error(
          `You are ${Math.round(distance)} meters away. You must be within ${attendanceEvent.geofenceRadiusMeters} meters to check in.`,
        );
      }

      const response = await attendanceAPI.checkIn(attendanceEvent.id, {
        method: 'GEOFENCE',
        geofenceVerified: true,
      });
      const attendance = response.data?.attendance;
      setEvents((current) =>
        current.map((item) =>
          item.id === attendanceEvent.id
            ? { ...item, attendance }
            : item,
        ),
      );
      setMessage(`Checked in to ${attendanceEvent.title}.`);
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to submit in-person attendance.'));
    } finally {
      setSubmittingEventId(null);
    }
  };

  const handleOpenRoster = async (attendanceEvent: AttendanceEvent) => {
    setRosterOpen(true);
    setRosterEventTitle(attendanceEvent.title);
    setLoadingRoster(true);
    setRoster([]);
    setError(null);

    try {
      const response = await attendanceAPI.listAttendances(attendanceEvent.id);
      const items = Array.isArray(response.data?.attendances) ? (response.data.attendances as AttendanceRosterRow[]) : [];
      setRoster(items);
    } catch (err: any) {
      setRoster([]);
      setError(parseApiError(err, 'Failed to load attendance roster.'));
    } finally {
      setLoadingRoster(false);
    }
  };

  const setAvailabilitySlotValue = (eventId: string, slotStart: string, shouldSelect: boolean) => {
    setAvailabilitySelections((current) => {
      const existing = new Set(current[eventId] ?? []);
      if (shouldSelect) existing.add(slotStart);
      else existing.delete(slotStart);
      return {
        ...current,
        [eventId]: Array.from(existing).sort(),
      };
    });
  };

  const handleAvailabilityPointerDown = (
    eventId: string,
    slotStart: string,
    isSelected: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const mode: 'add' | 'remove' = isSelected ? 'remove' : 'add';
    setAvailabilityDragState({ eventId, mode });
    setAvailabilitySlotValue(eventId, slotStart, mode === 'add');
  };

  const handleAvailabilityPointerEnter = (eventId: string, slotStart: string) => {
    if (!availabilityDragState || availabilityDragState.eventId !== eventId) return;
    setAvailabilitySlotValue(eventId, slotStart, availabilityDragState.mode === 'add');
  };

  const handleSaveAvailability = async (attendanceEvent: AttendanceEvent) => {
    const selectedSlots = availabilitySelections[attendanceEvent.id] ?? [];
    setSubmittingEventId(attendanceEvent.id);
    setMessage(null);
    setError(null);

    try {
      const response = await attendanceAPI.saveAvailability(attendanceEvent.id, {
        slotStarts: selectedSlots,
      });
      const updated = response.data?.event as AttendanceEvent;
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setAvailabilitySelections((current) => ({
        ...current,
        [attendanceEvent.id]: updated.availabilityPoll?.currentUserSlots ?? [],
      }));
      setMessage(`Saved your availability for ${attendanceEvent.title}.`);
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to save your availability.'));
    } finally {
      setSubmittingEventId(null);
    }
  };

  const renderEventCard = (attendanceEvent: AttendanceEvent) => {
    const codeWindowOpen =
      attendanceEvent.codeWindowOpensAt != null &&
      attendanceEvent.codeWindowClosesAt != null &&
      new Date(attendanceEvent.codeWindowOpensAt).getTime() <= nowMs &&
      new Date(attendanceEvent.codeWindowClosesAt).getTime() >= nowMs;
    const availabilityPoll = attendanceEvent.availabilityPoll;
    const selectedAvailabilitySlots = availabilitySelections[attendanceEvent.id] ?? availabilityPoll?.currentUserSlots ?? [];
    const availabilityDayKeys = availabilityPoll
      ? Array.from(new Set(availabilityPoll.slots.map((slot) => getAvailabilityDayKey(slot.start))))
      : [];
    const availabilityTimeRows = availabilityPoll
      ? Array.from(
          availabilityPoll.slots.reduce((map, slot) => {
            const date = new Date(slot.start);
            const key = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            if (!map.has(key)) {
              map.set(key, {
                key,
                label: formatAvailabilityTimeLabel(slot.start),
              });
            }
            return map;
          }, new Map<string, { key: string; label: string }>()).values(),
        )
      : [];
    const availabilitySlotByGridKey = availabilityPoll
      ? new Map(
          availabilityPoll.slots.map((slot) => {
            const date = new Date(slot.start);
            const timeKey = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            return [`${getAvailabilityDayKey(slot.start)}__${timeKey}`, slot] as const;
          }),
        )
      : new Map<string, NonNullable<AttendanceEvent['availabilityPoll']>['slots'][number]>();

    return (
      <Card key={attendanceEvent.id} className="border border-[var(--border)]">
        <CardHeader
          className="items-start gap-4 flex-wrap"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={attendanceEvent.locationType === 'ONLINE' ? 'info' : 'success'}>
                {attendanceEvent.locationType === 'ONLINE' ? 'Online' : 'In person'}
              </Badge>
              <Badge variant={attendanceEvent.audienceScope === 'GLOBAL' ? 'warning' : 'default'}>
                {attendanceEvent.audienceScope === 'GLOBAL' ? 'Everyone' : attendanceEvent.projectName || 'Team'}
              </Badge>
              <Badge variant="purple">
                {ATTENDANCE_CATEGORY_LABELS[attendanceEvent.category]}
              </Badge>
            </div>
          }
        >
          <div className="space-y-2">
            <CardTitle>{attendanceEvent.title}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                {new Date(attendanceEvent.eventDate).toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {attendanceEvent.locationType === 'ONLINE' ? <Monitor className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                {attendanceEvent.locationType === 'ONLINE'
                  ? 'Online check-in'
                  : attendanceEvent.locationLabel || 'In-person location'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {attendanceEvent.attendanceCount} checked in
              </span>
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">Created by {attendanceEvent.createdByName}</p>
              {attendanceEvent.attendance?.present ? (
                <Badge variant="success">
                  Checked in {attendanceEvent.attendance.checkedInAt ? `at ${new Date(attendanceEvent.attendance.checkedInAt).toLocaleTimeString()}` : ''}
                </Badge>
              ) : (
                <Badge variant="warning">Not checked in yet</Badge>
              )}
            </div>

            {/* {attendanceEvent.locationType === 'IN_PERSON' && (
              <div className="space-y-1 text-sm text-[var(--foreground)]/75">
               
                {attendanceEvent.canManage && attendanceEvent.latitude != null && attendanceEvent.longitude != null && (
                  <p>
                    Saved geofence coordinates: {attendanceEvent.latitude.toFixed(6)}, {attendanceEvent.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            )} */}

            {attendanceEvent.locationType === 'ONLINE' && attendanceEvent.canControlOnlineCode && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--foreground)]/55">4-digit code</p>
                  <p className="text-2xl font-semibold tracking-[0.3em] text-[var(--primary)]">
                    {attendanceEvent.verificationCode ?? '----'}
                  </p>
                </div>
                <div className="text-sm text-[var(--foreground)]/75">
                  <p className="inline-flex items-center gap-1.5">
                    <Clock3 className="w-4 h-4" />
                    {codeWindowOpen
                      ? formatCountdown(attendanceEvent.codeWindowClosesAt, nowMs)
                      : attendanceEvent.codeWindowClosesAt
                        ? `Last window closed at ${new Date(attendanceEvent.codeWindowClosesAt).toLocaleTimeString()}`
                        : 'Code window has not been opened yet'}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleOpenCodeWindow(attendanceEvent)}
                  loading={submittingEventId === attendanceEvent.id}
                >
                  Open 2-minute code window
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleDeleteEvent(attendanceEvent)}
                  loading={submittingEventId === attendanceEvent.id}
                >
                  Delete event
                </Button>
              </div>
            )}

            {attendanceEvent.locationType === 'ONLINE' && !attendanceEvent.attendance?.present && (
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={codeInputs[attendanceEvent.id] || ''}
                  onChange={(event) =>
                    setCodeInputs((current) => ({ ...current, [attendanceEvent.id]: event.target.value.replace(/\D/g, '').slice(0, 4) }))
                  }
                  inputMode="numeric"
                  placeholder="Enter 4-digit code"
                  className="w-full md:max-w-xs rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                />
                <Button
                  onClick={() => void handleOnlineCheckIn(attendanceEvent)}
                  loading={submittingEventId === attendanceEvent.id}
                >
                  Submit online attendance
                </Button>
              </div>
            )}

            {attendanceEvent.locationType === 'IN_PERSON' && !attendanceEvent.attendance?.present && (
              <Button
                onClick={() => void handleInPersonCheckIn(attendanceEvent)}
                loading={submittingEventId === attendanceEvent.id}
                icon={<LocateFixed className="w-4 h-4" />}
              >
                Check in
              </Button>
            )}
          </div>

          {attendanceEvent.canManage && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => void handleOpenRoster(attendanceEvent)}>
                  View attendance
                </Button>
                {attendanceEvent.locationType === 'IN_PERSON' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDeleteEvent(attendanceEvent)}
                    loading={submittingEventId === attendanceEvent.id}
                  >
                    Delete event
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/attendance" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div>
                <CardDescription>Total visible events</CardDescription>
                <CardTitle className="text-3xl">{eventCounts.total}</CardTitle>
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardDescription>Your check-ins</CardDescription>
                <CardTitle className="text-3xl">{eventCounts.checkedIn}</CardTitle>
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader
              action={
                canCreate ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setCreateOpen(true);
                    }}
                  >
                    Create event
                  </Button>
                ) : null
              }
            >
              <div>
                <CardDescription>Events you manage</CardDescription>
                <CardTitle className="text-3xl">{eventCounts.managed}</CardTitle>
              </div>
            </CardHeader>
          </Card>
        </section>

        {message && (
          <p className="text-sm rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-red-700">
            {error}
          </p>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--primary)]" />
            <h2 className="text-xl font-semibold">Upcoming Events</h2>
          </div>
          {upcomingEvents.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-[var(--foreground)]/65">No upcoming attendance events are visible to you right now.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {upcomingEvents.map(renderEventCard)}
            </div>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Past Events</h2>
            <div className="grid gap-4">
              {pastEvents.map(renderEventCard)}
            </div>
          </section>
        )}
      </main>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create attendance event"
        size="lg"
      >
        <form onSubmit={handleCreateEvent} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Event title</span>
              <input
                value={form.title}
                onChange={(event) => handleFormChange('title', event.target.value)}
                placeholder="Weekly standup"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Date and time</span>
              <input
                type="datetime-local"
                value={form.eventDate}
                onChange={(event) => handleFormChange('eventDate', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Location mode</p>
            <div className="flex gap-3 flex-wrap">
              <Button
                type="button"
                variant={form.locationType === 'ONLINE' ? 'primary' : 'outline'}
                onClick={() => handleFormChange('locationType', 'ONLINE')}
              >
                Online
              </Button>
              <Button
                type="button"
                variant={form.locationType === 'IN_PERSON' ? 'primary' : 'outline'}
                onClick={() => handleFormChange('locationType', 'IN_PERSON')}
              >
                In-person
              </Button>
            </div>
          </div>

          {role !== 'PM' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Audience</p>
              <div className="flex gap-3 flex-wrap">
                <Button
                  type="button"
                  variant={form.audienceScope === 'TEAM' ? 'primary' : 'outline'}
                  onClick={() => handleFormChange('audienceScope', 'TEAM')}
                >
                  Specific team
                </Button>
                <Button
                  type="button"
                  variant={form.audienceScope === 'GLOBAL' ? 'primary' : 'outline'}
                  onClick={() => handleFormChange('audienceScope', 'GLOBAL')}
                >
                  Everyone
                </Button>
              </div>
            </div>
          )}

          {(role === 'PM' || form.audienceScope === 'TEAM') && (
            <div className="space-y-4">
              <label className="space-y-2 text-sm block">
                <span className="font-medium">Team</span>
                <select
                  value={form.projectId}
                  onChange={(event) => handleFormChange('projectId', event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  required
                >
                  <option value="">Select team</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

            </div>
          )}

          <label className="space-y-2 text-sm block">
            <span className="font-medium">Event tag</span>
            <select
              value={form.category}
              onChange={(event) => handleFormChange('category', event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              required
            >
              {getAllowedCategoriesForScope(role === 'PM' ? 'TEAM' : form.audienceScope).map((category) => (
                <option key={category} value={category}>
                  {ATTENDANCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>

          {form.locationType === 'IN_PERSON' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="font-medium">Event location</span>
                <div className="relative">
                  <input
                    value={form.locationLabel}
                    onChange={(event) => handleFormChange('locationLabel', event.target.value)}
                    onFocus={() => setShowLocationSuggestions(locationSuggestions.length > 0)}
                    placeholder="Start typing an address or place"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                    required
                  />
                  {showLocationSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
                      {locationSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--accent)]"
                          onClick={() => {
                            setForm((current) => ({ ...current, locationLabel: suggestion.label }));
                            setResolvedLocation({
                              latitude: suggestion.latitude,
                              longitude: suggestion.longitude,
                            });
                            setLocationResolvedFor(suggestion.label);
                            setShowLocationSuggestions(false);
                          }}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4 space-y-3">
                <div className="text-sm text-[var(--foreground)]/75">
                  <p className="font-medium text-[var(--foreground)]">Address lookup</p>
                  <p>Select a suggested place from the dropdown. The app will use its coordinates automatically and keep the geofence fixed at 150 meters.</p>
                  {resolvingLocation && <p className="mt-2">Searching for matching locations...</p>}
                </div>
                {resolvedLocation && locationResolvedFor === form.locationLabel.trim() && (
                  <p className="text-sm text-[var(--foreground)]/75">
                    Resolved coordinates: {resolvedLocation.latitude.toFixed(6)}, {resolvedLocation.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4 text-sm text-[var(--foreground)]/75">
              A random 4-digit code is generated when the event is created. The event manager can open a 2-minute check-in window during the meeting.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create event
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={rosterOpen}
        onClose={() => setRosterOpen(false)}
        title={`Attendance for ${rosterEventTitle}`}
        size="lg"
      >
        {loadingRoster ? (
          <p className="text-sm text-[var(--foreground)]/65">Loading attendance records...</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/65">No one has checked in yet.</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {roster.map((row) => (
              <div key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{row.name}</p>
                    <p className="text-xs text-[var(--foreground)]/65">{row.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="success">{row.present ? 'Present' : 'Not present'}</Badge>
                    <Badge variant={row.verificationMethod === 'CODE' ? 'info' : 'warning'}>
                      {row.verificationMethod === 'CODE' ? 'Online code' : 'Geofence'}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-[var(--foreground)]/65 mt-3">
                  Checked in at {new Date(row.checkedInAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
