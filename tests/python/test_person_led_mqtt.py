"""Tests for person_led_mqtt pure functions: extract_count and _to_number."""

import sys
import os

# Ensure the mqtt package directory is importable.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app", "mqtt"))

from person_led_mqtt import extract_count, _to_number


# ---------------------------------------------------------------------------
# extract_count
# ---------------------------------------------------------------------------
class TestExtractCount:
    def test_json_count_key(self):
        assert extract_count(b'{"count": 5}') == 5

    def test_json_person_count_key(self):
        assert extract_count(b'{"person_count": 3}') == 3

    def test_json_value_key_string(self):
        assert extract_count(b'{"value": "7"}') == 7

    def test_plain_integer_bytes(self):
        assert extract_count(b"42") == 42

    def test_plain_float_rounds(self):
        assert extract_count(b"3.7") == 4

    def test_empty_payload(self):
        assert extract_count(b"") is None

    def test_whitespace_only(self):
        assert extract_count(b"   ") is None

    def test_garbage_string(self):
        assert extract_count(b"not_a_number") is None

    def test_empty_dict(self):
        assert extract_count(b"{}") is None

    def test_json_number_directly(self):
        assert extract_count(b"99") == 99

    def test_json_float_directly(self):
        assert extract_count(b"2.4") == 2

    def test_count_key_non_numeric(self):
        assert extract_count(b'{"count": "abc"}') is None

    def test_zero_count(self):
        assert extract_count(b'{"count": 0}') == 0

    def test_negative_count(self):
        assert extract_count(b'{"count": -1}') == -1


# ---------------------------------------------------------------------------
# _to_number
# ---------------------------------------------------------------------------
class TestToNumber:
    def test_int(self):
        assert _to_number(5) == 5.0

    def test_float(self):
        assert _to_number(3.14) == 3.14

    def test_numeric_string(self):
        assert _to_number("42") == 42.0

    def test_float_string(self):
        assert _to_number("3.7") == 3.7

    def test_empty_string(self):
        assert _to_number("") is None

    def test_whitespace_string(self):
        assert _to_number("   ") is None

    def test_none(self):
        assert _to_number(None) is None

    def test_non_numeric_string(self):
        assert _to_number("abc") is None

    def test_bool_true(self):
        # bool is a subclass of int in Python
        assert _to_number(True) == 1.0
