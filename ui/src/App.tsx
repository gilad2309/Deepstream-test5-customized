import { useEffect, useRef, useState } from 'preact/hooks';
import mqtt from 'mqtt/dist/mqtt';
import type { MqttClient } from 'mqtt';
import { fetchStatus, startSurveillance } from './lib/api';
import { getMqttUrl, getPersonCountTopic } from './lib/config';
import { parseCount, MedianWindow } from './lib/parseCount';
import { ConnectionState } from './types';

export default function App() {
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [mqttState, setMqttState] = useState<ConnectionState>('idle');
  const [mqttError, setMqttError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const medianRef = useRef(new MedianWindow(5000));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, delayMs);
    };

    const load = async () => {
      let isRunning = false;
      try {
        const status = await fetchStatus();
        if (cancelled) return;
        isRunning = Boolean(status.running);
        setRunning(isRunning);
        if (!isRunning) {
          setCount(null);
          medianRef.current.clear();
        }
        setActionError(null);
      } catch (err: any) {
        if (!cancelled) setActionError(err?.message || 'Failed to fetch status');
      } finally {
        if (cancelled) return;
        // Poll faster when running, slower when idle to reduce load.
        schedule(isRunning ? 1000 : 5000);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const url = getMqttUrl();
    const topic = getPersonCountTopic();

    setMqttState('connecting');
    setMqttError(null);

    const client = mqtt.connect(url, {
      clientId: `ui-count-${Math.random().toString(16).slice(2)}`,
      keepalive: 30,
      reconnectPeriod: 2000,
      clean: true
    });
    clientRef.current = client;

    client.on('connect', () => {
      if (disposed) return;
      setMqttState('connected');
      client.subscribe(topic);
    });

    client.on('reconnect', () => {
      if (disposed) return;
      setMqttState('connecting');
    });

    client.on('message', (msgTopic, payload) => {
      if (disposed || msgTopic !== topic) return;
      const raw = parseCount(payload.toString());
      if (typeof raw === 'number') {
        setCount(medianRef.current.push(raw));
        setRunning(true);
      }
    });

    client.on('error', (err) => {
      if (disposed) return;
      setMqttState('error');
      setMqttError(err?.message || 'MQTT error');
    });

    client.on('close', () => {
      if (disposed) return;
      setMqttState((prev) => (prev === 'error' ? 'error' : 'idle'));
    });

    return () => {
      disposed = true;
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, []);

  const handleStart = async () => {
    setActionError(null);
    setStarting(true);
    try {
      const status = await startSurveillance();
      setRunning(Boolean(status.running ?? true));
    } catch (err: any) {
      setActionError(err?.message || 'Start failed');
    } finally {
      setStarting(false);
    }
  };

  const buttonText = running ? 'Running' : starting ? 'Starting…' : 'Start Surveillance';

  return (
    <div className="app">
      <div className="panel">
        <div className="title">Surveillance</div>
        <div className="count">{count ?? '—'}</div>
        <div className="label">People detected</div>
        <div className="row">
          <span className={`pill ${running ? 'on' : ''}`}>{running ? 'Running' : 'Idle'}</span>
          <span className={`pill ${mqttState === 'connected' ? 'on' : ''}`}>
            MQTT {mqttState}
          </span>
        </div>
        <button onClick={handleStart} disabled={starting || running}>
          {buttonText}
        </button>
        {actionError && <div className="error">{actionError}</div>}
        {mqttError && <div className="error">{mqttError}</div>}
      </div>
    </div>
  );
}
