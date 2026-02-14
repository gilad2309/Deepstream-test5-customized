"""Tests for command_listener pure functions: parse_mqtt_url and extract_command_text."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app", "mqtt"))

from command_listener import parse_mqtt_url, extract_command_text


# ---------------------------------------------------------------------------
# parse_mqtt_url
# ---------------------------------------------------------------------------
class TestParseMqttUrl:
    def test_full_mqtt_url(self):
        assert parse_mqtt_url("mqtt://192.168.1.1:1883") == ("192.168.1.1", 1883)

    def test_mqtts_with_port(self):
        assert parse_mqtt_url("mqtts://broker.com:8883") == ("broker.com", 8883)

    def test_mqtts_default_port(self):
        assert parse_mqtt_url("mqtts://secure.broker") == ("secure.broker", 8883)

    def test_no_scheme(self):
        assert parse_mqtt_url("localhost:1883") == ("localhost", 1883)

    def test_no_port_plain(self):
        assert parse_mqtt_url("mqtt://broker.example.com") == (
            "broker.example.com",
            1883,
        )

    def test_url_with_path(self):
        assert parse_mqtt_url("mqtt://host:1883/some/path") == ("host", 1883)

    def test_custom_port(self):
        assert parse_mqtt_url("mqtt://host:9999") == ("host", 9999)

    def test_no_scheme_no_port(self):
        assert parse_mqtt_url("myhost") == ("myhost", 1883)


# ---------------------------------------------------------------------------
# extract_command_text
# ---------------------------------------------------------------------------
class TestExtractCommandText:
    def test_json_command_key(self):
        assert extract_command_text('{"command": "run"}') == "run"

    def test_json_action_key(self):
        assert extract_command_text('{"action": "stop"}') == "stop"

    def test_json_text_key(self):
        assert extract_command_text('{"text": "start pipeline"}') == "start pipeline"

    def test_json_message_key(self):
        assert extract_command_text('{"message": "hello"}') == "hello"

    def test_plain_string(self):
        assert extract_command_text("run") == "run"

    def test_plain_string_with_whitespace(self):
        assert extract_command_text("  stop  ") == "stop"

    def test_empty_string(self):
        assert extract_command_text("") is None

    def test_whitespace_only(self):
        assert extract_command_text("   ") is None

    def test_empty_dict(self):
        assert extract_command_text("{}") is None

    def test_dict_with_empty_value(self):
        assert extract_command_text('{"command": ""}') is None

    def test_key_priority_command_first(self):
        result = extract_command_text('{"command": "run", "action": "stop"}')
        assert result == "run"

    def test_invalid_json_falls_back_to_plain(self):
        assert extract_command_text("{bad json") == "{bad json"
