import { describe, it, expect } from 'vitest'
import { emptyForm, formToPayload, type Camera } from './cameraFormUtils'

describe('cameraFormUtils live_transport', () => {
  it('defaults to auto for a new camera', () => {
    expect(emptyForm().live_transport).toBe('auto')
  })

  it('reads the camera value when editing', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x', live_transport: 'hls' } as Camera
    expect(emptyForm(cam).live_transport).toBe('hls')
  })

  it('defaults to auto when the camera has no preference', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x' } as Camera
    expect(emptyForm(cam).live_transport).toBe('auto')
  })

  it('serializes live_transport into the payload', () => {
    const form = emptyForm()
    form.live_transport = 'webrtc'
    expect(formToPayload(form).live_transport).toBe('webrtc')
  })
})

describe('cameraFormUtils capture_type (história feat/camera-form-reshape)', () => {
  it('defaults to rtsp for a new camera', () => {
    expect(emptyForm().capture_type).toBe('rtsp')
  })

  it('reads the camera value when editing', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x', capture_type: 'hls' } as Camera
    expect(emptyForm(cam).capture_type).toBe('hls')
  })

  it('defaults to rtsp when the camera has no preference', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x' } as Camera
    expect(emptyForm(cam).capture_type).toBe('rtsp')
  })

  it('serializes capture_type into the payload', () => {
    const form = emptyForm()
    form.capture_type = 'hls'
    expect(formToPayload(form).capture_type).toBe('hls')
  })
})

describe('cameraFormUtils live_enabled (história feat/camera-form-reshape)', () => {
  it('defaults to true for a new camera', () => {
    expect(emptyForm().live_enabled).toBe(true)
  })

  it('reads the camera value when editing (false)', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x', live_enabled: false } as Camera
    expect(emptyForm(cam).live_enabled).toBe(false)
  })

  it('defaults to true when the camera has no preference', () => {
    const cam = { id: 'c', name: 'C', rtsp_url: 'rtsp://x' } as Camera
    expect(emptyForm(cam).live_enabled).toBe(true)
  })

  it('serializes live_enabled into the payload', () => {
    const form = emptyForm()
    form.live_enabled = false
    expect(formToPayload(form).live_enabled).toBe(false)
  })
})
