import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { can, type Area } from './lib/permissions';
import { Layout } from './components/Layout';
import { Empty, Loading } from './components/ui';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { FrontDesk } from './pages/hotel/FrontDesk';
import { Reservations } from './pages/hotel/Reservations';
import { ReservationPage } from './pages/hotel/ReservationPage';
import { RoomsBoard } from './pages/hotel/RoomsBoard';
import { Guests } from './pages/hotel/Guests';
import { Housekeeping } from './pages/hotel/Housekeeping';
import { FloorPlan } from './pages/dining/FloorPlan';
import { Pos } from './pages/dining/Pos';
import { Kitchen } from './pages/dining/Kitchen';
import { TableBookings } from './pages/dining/TableBookings';
import { MenuManager } from './pages/dining/MenuManager';
import { Pool } from './pages/rooftop/Pool';
import { ClubNights } from './pages/rooftop/ClubNights';
import { ClubDoor } from './pages/rooftop/ClubDoor';
import { EventsPipeline } from './pages/events/EventsPipeline';
import { EventsCalendar } from './pages/events/EventsCalendar';
import { EventPage } from './pages/events/EventPage';
import { Inventory } from './pages/office/Inventory';
import { StaffRota } from './pages/office/StaffRota';
import { Reports } from './pages/office/Reports';
import { SettingsPage } from './pages/office/Settings';
import { SiteLayout } from './site/SiteLayout';
import { Home } from './site/Home';
import { Stay, ManageBooking } from './site/Stay';
import { Dine, OrderTrack } from './site/Dine';
import { Rooftop } from './site/Rooftop';
import { Celebrate } from './site/Celebrate';

function Guard({ area, children }: { area: Area; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user?.role, area)) {
    return (
      <Empty title="This door is locked.">
        Your role doesn’t have access to this area. Ask a manager if you need it.
      </Empty>
    );
  }
  return <>{children}</>;
}

export function App() {
  const { user, ready } = useAuth();
  const loc = useLocation();

  // Guest-facing website: public, no staff login.
  if (loc.pathname === '/visit' || loc.pathname.startsWith('/visit/')) {
    return (
      <Routes>
        <Route path="visit" element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="stay" element={<Stay />} />
          <Route path="booking" element={<ManageBooking />} />
          <Route path="dine" element={<Dine />} />
          <Route path="order/:code" element={<OrderTrack />} />
          <Route path="rooftop" element={<Rooftop />} />
          <Route path="events" element={<Celebrate />} />
          <Route path="*" element={<Navigate to="/visit" replace />} />
        </Route>
      </Routes>
    );
  }

  if (!ready) return <Loading label="Opening the front door…" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />

        <Route path="front-desk" element={<Guard area="front_office"><FrontDesk /></Guard>} />
        <Route path="reservations" element={<Guard area="front_office"><Reservations /></Guard>} />
        <Route path="reservations/:id" element={<Guard area="front_office"><ReservationPage /></Guard>} />
        <Route path="rooms" element={<Guard area="rooms"><RoomsBoard /></Guard>} />
        <Route path="guests" element={<Guard area="front_office"><Guests /></Guard>} />
        <Route path="housekeeping" element={<Guard area="housekeeping"><Housekeeping /></Guard>} />

        <Route path="restaurant" element={<Guard area="restaurant"><FloorPlan outlet="restaurant" /></Guard>} />
        <Route path="restaurant/pos/:id" element={<Guard area="restaurant"><Pos outlet="restaurant" /></Guard>} />
        <Route path="restaurant/bookings" element={<Guard area="restaurant"><TableBookings /></Guard>} />
        <Route path="restaurant/menu" element={<Guard area="restaurant"><MenuManager outlet="restaurant" /></Guard>} />
        <Route path="kitchen" element={<Kitchen />} />

        <Route path="rooftop" element={<Guard area="rooftop_bar"><FloorPlan outlet="rooftop" /></Guard>} />
        <Route path="rooftop/pos/:id" element={<Guard area="rooftop_bar"><Pos outlet="rooftop" /></Guard>} />
        <Route path="rooftop/menu" element={<Guard area="rooftop_bar"><MenuManager outlet="rooftop" /></Guard>} />
        <Route path="rooftop/pool" element={<Guard area="pool"><Pool /></Guard>} />
        <Route path="rooftop/club" element={<Guard area="club"><ClubNights /></Guard>} />
        <Route path="rooftop/club/:id" element={<Guard area="club"><ClubDoor /></Guard>} />

        <Route path="events" element={<Guard area="events"><EventsPipeline /></Guard>} />
        <Route path="events/calendar" element={<Guard area="events"><EventsCalendar /></Guard>} />
        <Route path="events/:id" element={<Guard area="events"><EventPage /></Guard>} />

        <Route path="inventory" element={<Guard area="inventory"><Inventory /></Guard>} />
        <Route path="staff" element={<Guard area="staff"><StaffRota /></Guard>} />
        <Route path="reports" element={<Guard area="reports"><Reports /></Guard>} />
        <Route path="settings" element={<Guard area="settings"><SettingsPage /></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
