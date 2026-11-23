import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeCostAuthorization,
  createSafeRunwayCostTicket
} from '@/lib/engine/safe-cost-gate-v6';

test('ViralCine 6 Safe calcula Gen-4 Turbo 8s como US$0.40', () => {
  const ticket = createSafeRunwayCostTicket({
    projectId: 'project-safe',
    sceneOrder: 2,
    shotOrder: 2,
    shotId: 'shot-safe',
    durationSeconds: 8,
    model: 'gen4_turbo',
    ratio: '1280:720'
  });

  assert.equal(ticket.creditsPerSecond, 5);
  assert.equal(ticket.credits, 40);
  assert.equal(ticket.maxUsd, 0.4);
  assert.equal(
    ticket.exactConfirmation,
    'AUTORIZO US$0.40 ' + ticket.ticketId
  );
});

test('Safe Cost Gate bloquea aunque la confirmación sea correcta si APIs pagadas están apagadas', () => {
  const previousExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const previousPaid = process.env.ALLOW_PAID_GENERATION;
  try {
    process.env.ALLOW_EXTERNAL_API_CALLS = 'false';
    process.env.ALLOW_PAID_GENERATION = 'false';

    const ticket = createSafeRunwayCostTicket({
      projectId: 'project-safe',
      sceneOrder: 2,
      shotOrder: 2,
      shotId: 'shot-safe',
      durationSeconds: 8
    });

    assert.throws(
      () => assertSafeCostAuthorization(ticket, ticket.exactConfirmation),
      /ALLOW_EXTERNAL_API_CALLS=false/
    );
  } finally {
    if (previousExternal === undefined) delete process.env.ALLOW_EXTERNAL_API_CALLS;
    else process.env.ALLOW_EXTERNAL_API_CALLS = previousExternal;

    if (previousPaid === undefined) delete process.env.ALLOW_PAID_GENERATION;
    else process.env.ALLOW_PAID_GENERATION = previousPaid;
  }
});

test('Safe Cost Gate exige texto de autorización exacto y respeta el tope por llamada', () => {
  const previousExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const previousPaid = process.env.ALLOW_PAID_GENERATION;
  const previousLimit = process.env.SAFE_MAX_SINGLE_CALL_USD;
  try {
    process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
    process.env.ALLOW_PAID_GENERATION = 'true';
    process.env.SAFE_MAX_SINGLE_CALL_USD = '0.50';

    const ticket = createSafeRunwayCostTicket({
      projectId: 'project-safe',
      sceneOrder: 2,
      shotOrder: 2,
      shotId: 'shot-safe',
      durationSeconds: 8
    });

    assert.throws(
      () => assertSafeCostAuthorization(ticket, 'SI'),
      /autorización incorrecta/i
    );

    assert.doesNotThrow(
      () => assertSafeCostAuthorization(ticket, ticket.exactConfirmation)
    );

    process.env.SAFE_MAX_SINGLE_CALL_USD = '0.30';
    assert.throws(
      () => assertSafeCostAuthorization(ticket, ticket.exactConfirmation),
      /supera el máximo por llamada/i
    );
  } finally {
    if (previousExternal === undefined) delete process.env.ALLOW_EXTERNAL_API_CALLS;
    else process.env.ALLOW_EXTERNAL_API_CALLS = previousExternal;

    if (previousPaid === undefined) delete process.env.ALLOW_PAID_GENERATION;
    else process.env.ALLOW_PAID_GENERATION = previousPaid;

    if (previousLimit === undefined) delete process.env.SAFE_MAX_SINGLE_CALL_USD;
    else process.env.SAFE_MAX_SINGLE_CALL_USD = previousLimit;
  }
});
