import { REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY } from '../../shared/protocol-version'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  addEnvironmentFromPairingCode,
  markEnvironmentUsed
} from '../../shared/runtime-environment-store'
import { pairingCode } from './runtime-environments-ipc-test-harness'
import {
  getRuntimeEnvironmentStatus,
  resetSharedControlSupport
} from './runtime-environment-transport-routing'

const { request, publish } = vi.hoisted(() => ({ request: vi.fn(), publish: vi.fn() }))
vi.mock('../../shared/remote-runtime-client', () => ({
  sendRemoteRuntimeRequest: request,
  subscribeRemoteRuntimeRequest: vi.fn()
}))
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: publish }
      }
    ]
  }
}))

let profile: string
beforeEach(() => {
  vi.useFakeTimers()
  request.mockReset()
  publish.mockReset()
  profile = mkdtempSync(join(tmpdir(), 'orca-status-recovery-'))
})
afterEach(() => {
  resetSharedControlSupport()
  vi.useRealTimers()
  rmSync(profile, { recursive: true, force: true })
})

it('recovers a saved host after its first status check fails, without another UI request', async () => {
  const environment = addEnvironmentFromPairingCode(profile, {
    name: 'offline-at-startup',
    pairingCode: pairingCode()
  })
  request
    .mockRejectedValueOnce(
      Object.assign(new Error('host offline'), { code: 'runtime_unavailable' })
    )
    .mockResolvedValue({
      id: 'status',
      ok: true,
      result: { runtimeId: 'host-1', graphStatus: 'ready', capabilities: [] },
      _meta: { runtimeId: 'host-1' }
    })
  expect((await getRuntimeEnvironmentStatus(profile, environment.id)).ok).toBe(false)
  await vi.advanceTimersByTimeAsync(3_000)
  expect(request).toHaveBeenCalledTimes(2)
  expect(publish).toHaveBeenCalledWith(
    'runtimeEnvironments:statusChanged',
    expect.objectContaining({
      environmentId: environment.id,
      verification: 'verified',
      status: expect.objectContaining({ runtimeId: 'host-1' })
    })
  )
  await vi.advanceTimersByTimeAsync(300_000)
  expect(request).toHaveBeenCalledTimes(2)
})

it('a passive capability check does not strand later active bootstrap recovery', async () => {
  const environment = addEnvironmentFromPairingCode(profile, {
    name: 'passive-first',
    pairingCode: pairingCode()
  })
  request
    .mockResolvedValueOnce({
      id: 'status',
      ok: true,
      result: { runtimeId: 'host-1', capabilities: [REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY] },
      _meta: { runtimeId: 'host-1' }
    })
    .mockRejectedValue(new Error('host offline'))
  await getRuntimeEnvironmentStatus(profile, environment.id, undefined, { observeOnly: true })
  await getRuntimeEnvironmentStatus(profile, environment.id)
  await vi.advanceTimersByTimeAsync(3_000)
  expect(request).toHaveBeenCalledTimes(3)
})

it('publishes the runtime id persisted before this run beside the one that just answered', async () => {
  const environment = addEnvironmentFromPairingCode(profile, {
    name: 'restarted-while-away',
    pairingCode: pairingCode()
  })
  markEnvironmentUsed(profile, environment.id, { runtimeId: 'host-before' })
  request.mockResolvedValue({
    id: 'status',
    ok: true,
    result: { runtimeId: 'host-after', graphStatus: 'ready', capabilities: [] },
    _meta: { runtimeId: 'host-after' }
  })
  expect((await getRuntimeEnvironmentStatus(profile, environment.id)).ok).toBe(true)
  expect(publish).toHaveBeenCalledWith(
    'runtimeEnvironments:statusChanged',
    expect.objectContaining({
      verification: 'verified',
      priorRuntimeId: 'host-before',
      status: expect.objectContaining({ runtimeId: 'host-after' })
    })
  )
})

it('publishes no prior runtime id for a host this client never verified', async () => {
  const environment = addEnvironmentFromPairingCode(profile, {
    name: 'never-verified',
    pairingCode: pairingCode()
  })
  request.mockResolvedValue({
    id: 'status',
    ok: true,
    result: { runtimeId: 'host-1', graphStatus: 'ready', capabilities: [] },
    _meta: { runtimeId: 'host-1' }
  })
  await getRuntimeEnvironmentStatus(profile, environment.id)
  expect(publish).toHaveBeenCalledWith(
    'runtimeEnvironments:statusChanged',
    expect.objectContaining({ verification: 'verified', priorRuntimeId: null })
  )
})
