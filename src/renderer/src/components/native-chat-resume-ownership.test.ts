import { describe, expect, it } from 'vitest'
import { AUTOMATION_PROVENANCE } from './native-chat-restart-offer-test-support'
import {
  classifyResumeWorkspaceOwnership,
  parseResumeOwnership,
  resumeOwnershipLabel
} from './native-chat-resume-ownership'

const SERVER = { kind: 'environment', environmentId: 'studio' } as const
const LOCAL = { kind: 'local' } as const
const ME = 'device-me'

describe('whose interrupted chat this is', () => {
  it('on a paired server, is the user’s only with a record naming this device', () => {
    const mine = { creatorProvenance: { kind: 'paired-device' as const, deviceId: ME } }
    expect(classifyResumeWorkspaceOwnership(mine, SERVER, ME)).toBe('own')
    expect(
      classifyResumeWorkspaceOwnership(
        { creatorProvenance: { kind: 'paired-device', deviceId: 'device-other' } },
        SERVER,
        ME
      )
    ).toBe('other-device')
    expect(
      classifyResumeWorkspaceOwnership({ creatorProvenance: { kind: 'host' } }, SERVER, ME)
    ).toBe('server-made')
  })

  it('on a paired server, treats every missing fact as unknown, never as the user’s', () => {
    expect(classifyResumeWorkspaceOwnership(undefined, SERVER, ME)).toBe('unknown')
    expect(classifyResumeWorkspaceOwnership({}, SERVER, ME)).toBe('unknown')
    const mine = { creatorProvenance: { kind: 'paired-device' as const, deviceId: ME } }
    expect(classifyResumeWorkspaceOwnership(mine, SERVER, undefined)).toBe('unknown')
  })

  it('calls an automation’s workspace an automation’s, on either machine', () => {
    const robot = {
      creatorProvenance: { kind: 'paired-device' as const, deviceId: ME },
      automationProvenance: AUTOMATION_PROVENANCE
    }
    expect(classifyResumeWorkspaceOwnership(robot, SERVER, ME)).toBe('automation')
    expect(classifyResumeWorkspaceOwnership(robot, LOCAL, undefined)).toBe('automation')
  })

  it('on this computer, is the user’s unless another device made the workspace', () => {
    expect(classifyResumeWorkspaceOwnership(undefined, LOCAL, undefined)).toBe('own')
    expect(classifyResumeWorkspaceOwnership({}, LOCAL, undefined)).toBe('own')
    expect(
      classifyResumeWorkspaceOwnership({ creatorProvenance: { kind: 'host' } }, LOCAL, undefined)
    ).toBe('own')
    expect(
      classifyResumeWorkspaceOwnership(
        { creatorProvenance: { kind: 'paired-device', deviceId: 'phone' } },
        LOCAL,
        undefined
      )
    ).toBe('other-device')
  })

  it('labels every chat that does not start ticked, and none that does', () => {
    expect(resumeOwnershipLabel('own', 'studio-mac')).toBeUndefined()
    expect(resumeOwnershipLabel('automation', 'studio-mac')).toBe('Automation')
    expect(resumeOwnershipLabel('other-device', 'studio-mac')).toBe('Another device')
    expect(resumeOwnershipLabel('server-made', 'studio-mac')).toBe('Made on studio-mac')
    expect(resumeOwnershipLabel('unknown', 'studio-mac')).toBe('Unknown origin')
  })

  it('reads an unrecognised serialized answer back as unknown', () => {
    expect(parseResumeOwnership('own')).toBe('own')
    expect(parseResumeOwnership('mine')).toBe('unknown')
    expect(parseResumeOwnership(undefined)).toBe('unknown')
  })
})
