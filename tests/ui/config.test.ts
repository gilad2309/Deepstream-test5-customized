import { describe, it, expect } from 'vitest';
import { getMqttUrl, getPersonCountTopic } from '../../ui/src/lib/config';

describe('config', () => {
  it('getMqttUrl returns default when env var is unset', () => {
    expect(getMqttUrl()).toBe('ws://127.0.0.1:9001');
  });

  it('getPersonCountTopic returns default when env var is unset', () => {
    expect(getPersonCountTopic()).toBe('deepstream/person_count');
  });
});
