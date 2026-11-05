# Wall mode

A tablet on the wall shows a dashboard and nothing else: no sidebar, no header, the screen kept awake, a
screensaver with the clock after a while, dark at night. Wall mode is two decisions:

- **The house says how its walls behave** — in the panel's *Wall* tab (an administrator): which dashboards are
  walls, the screensaver, the day and night, the background. These settings travel with the house, like the look.
- **The device says it is a wall** — the tablet itself, once: open the dashboard's address with `?kiosk` on it
  (`https://your-home/fluvy-wall?kiosk`; the *Wall* tab shows the address and copies it), or switch *Use this device
  as a wall panel* on in the *Wall* tab from the tablet. The tablet remembers; a phone that opens the same dashboard
  is not a wall. `?kiosk=0` makes it a device again.

A page is a wall while both hold and the page is one of the house's walls: the dashboards chosen in *Wall
dashboards*, or, with none chosen, any dashboard that wears the look. Fluvy's own panel and Home Assistant's
Settings are never walls, so a tablet can always be administered from itself.

## On the wall

- The sidebar and the dashboard header are gone, and the dashboard fills the screen inside the tablet's safe area.
  The header's tabs go with it, so a wall moves between its views with what the dashboard itself holds (chips,
  headings, buttons that navigate). There is no swipe between views and no gesture of Fluvy's.
- **Subviews**: Home Assistant shows its back arrow in the header, which a wall does not have. The house chooses the
  way back in the *Wall* tab (*Back from a subview*):
  - **Back button** (the default): a pill at the top left with a chevron and the subview's name. It sits on the line of the
    exit corner, and the view keeps room for it. A tap goes back as Home Assistant's own arrow does: to the view's
    `back_path`, or back where you came from.
  - **Header**: Home Assistant's header, with its arrow and the view's name, in subviews only. The exit corner moves
    under it.
- **Screensaver**: after 2, 5, 10 or 30 minutes without a touch (or never), the screen shows the clock and the weather
  over the wall background, or dims to black. Any touch wakes it — that touch does nothing else. A motion or
  occupancy sensor chosen as *Wake on motion* (a dropdown of every one the house has, with its room) wakes it too.
  *See the screensaver → Preview* shows it over the settings, as the wall would show it now, until a tap.
- **Day and night**: the wall is always dark, follows Home Assistant's own mode, follows the sun (`sun.sun`), or a
  pair of hours; at night it may darken further (20, 40 or 60 % of black over the page) for a dim room.
- **Background**: the page colour alone, or the wall mesh (the palette's own hues, one step deeper than the dashboards'
  Paper and Charcoal). A view with a background of its own (its *Background* in Home Assistant's view settings) keeps
  it on the wall; the wall's shows where a view has none.
- The screen is kept awake with a screen wake lock while the wall is awake; the API exists only on a secure page
  (HTTPS), so over plain HTTP the tablet's own screen timeout rules.

## Leaving the wall

The house chooses the way out in the *Wall* tab (*Way out*), and nobody is ever locked in:

- **Button** (the default): a small × in the top-right corner. It is there when the wall comes and whenever someone
  touches the screen or moves a pointer, and it fades when the wall is at rest. A tap takes the device out of wall
  mode: the sidebar and the header return, and a notice, *Wall mode off · Back to the wall*, offers the way back for
  a few seconds. The device stays out until it is made a wall again (the notice, the tab's switch, or `?kiosk`).
- **Long press**: nothing shows. Press and hold the top-right corner for a second and a half: a ring fills, the
  tablet taps back, and the wall pauses — the chrome returns with *Wall paused · Resume*. The pause lasts until
  *Resume*, or until the screensaver would have started (with the screensaver set to *Never*, until a reload), and
  the device stays a wall: for a tablet that should not be left by a passing hand.

`?kiosk=0` on the address leaves wall mode too, from anywhere.

## Reading from across the room

A tablet on the wall is read from further away than a phone in the hand. The size is the device's own, like the
wall switch: open the dashboard's address with `?zoom=125` on it (90, 100, 110, 125 or 150), or choose it under
*This device · Size* in the panel's *Preferences* tab (the *Wall* tab's device card shows the same choice). The
tablet remembers; a phone that opens the same dashboard keeps its own size. `?zoom=100` or `?zoom=off` brings it back.

Only the dashboard's view grows — the cards, their text and their controls — and the layout follows: a column that
held three cards holds two. Home Assistant's header and sidebar, its dialogs and the edit mode stay at their size, so
a dashboard is edited as it is laid out. The size is read before Home Assistant paints, so a page never starts small
and jumps.

## Details

- The first visit with `?kiosk` paints the sidebar for an instant before the wall takes over; every reload after
  it starts as a wall (the device's memory is read before Home Assistant's pages exist). `?kiosk` is dropped from
  the address once read.
- Wall mode fails open: if Home Assistant's pages change under Fluvy's feet, the sidebar and the header simply
  return (see [troubleshooting](troubleshooting.md)).
- The wall's settings are the house's (`wall` in the settings file *Preferences* exports); what this device is
  and its size stay in the browser (`localStorage`, `fluvy:device`), and a pause in the session (`sessionStorage`,
  `fluvy:wall-paused`). `?zoom=` is dropped from the address once read, as `?kiosk` is.
- The wall's own pieces — the controller, the screensaver, the corner and the toast — load only on a device that
  is a wall (their own chunk); a phone never pays for them.
