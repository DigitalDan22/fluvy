import { byArea, capped, foldAt, moreCard } from '../caps.js';
import { COLUMNS } from '../context.js';
import { balanced, flowed, full, runsOf } from '../layout.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';
import { securityCards } from './home.js';

/*
 * The security dashboard (`custom:fluvy-security`): the overview (the alarm, what locks, what opens, the cameras),
 * every camera, and the openings room by room.
 */

/** Cameras on one Cameras card, at the dashboard's refresh. */
const cameras = (ids: readonly string[], ctx: StrategyContext): Card =>
  full('cameras', {
    cameras: [...ids],
    ...(ctx.style.refresh ? { refresh: ctx.style.refresh } : {}),
  });

/** The alarm first, then what opens (locks, garage doors and gates), what is open, and the first four cameras. */
function overviewView(ctx: StrategyContext): Section[] {
  return balanced(
    ctx,
    securityCards(ctx, (ids) => cameras(ids, ctx)),
  );
}

/** Every camera (twelve, then a "N more" row) on one Cameras card across the view's columns, at the dashboard's refresh. */
function camerasView(ctx: StrategyContext): Section[] {
  const all = capped(
    ctx,
    { key: 'cameras', title: 'strategy.cameras', icon: 'fluvy:camera', cap: 12 },
    ctx.home.cameras,
    (ids) => runsOf(ids, 4).map((run) => [cameras(run, ctx)]),
  );
  return [
    {
      type: 'grid',
      column_span: COLUMNS,
      cards: [{ ...cameras(all.shown, ctx), grid_options: { columns: 'full' } }, ...moreCard(all)],
    },
  ];
}

/**
 * The openings by room (a card a room when the house has areas, else one), every one of them: each card folds its own
 * at their cap.
 */
function openingsView(ctx: StrategyContext): Section[] {
  return flowed(
    ctx,
    byArea(ctx, ctx.home.openings, ctx.t('strategy.sensors'), (title, ids) => [
      full('openings', { title, entities: [...ids], ...foldAt(ctx, 'openings', ids) }),
    ]),
  );
}

export const SECURITY_VIEWS: readonly ViewSpec[] = [
  {
    key: 'overview',
    icon: 'fluvy:shield',
    title: 'strategy.security',
    build: overviewView,
    when: () => true,
  },
  {
    key: 'cameras',
    icon: 'fluvy:camera',
    title: 'strategy.cameras',
    build: camerasView,
    when: ({ home }) => home.cameras.length > 0,
  },
  {
    key: 'openings',
    icon: 'fluvy:door',
    title: 'strategy.openings',
    build: openingsView,
    when: ({ home }) => home.openings.length > 0,
  },
];
