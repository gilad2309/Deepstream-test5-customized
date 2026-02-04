const DEFAULT_MQTT_WS_URL = 'ws://127.0.0.1:9001';
const DEFAULT_PERSON_COUNT_TOPIC = 'deepstream/person_count';

export function getMqttUrl(): string {
  return import.meta.env.VITE_MQTT_WS_URL || DEFAULT_MQTT_WS_URL;
}

export function getPersonCountTopic(): string {
  return import.meta.env.VITE_PERSON_COUNT_TOPIC || DEFAULT_PERSON_COUNT_TOPIC;
}
