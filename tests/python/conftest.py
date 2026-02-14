"""Shared fixtures for MQTT module tests.

Mocks Jetson.GPIO before any test imports person_led_mqtt so the module
can be loaded on non-Jetson machines.
"""

import sys
from unittest.mock import MagicMock

# Provide a fake Jetson.GPIO module so importing person_led_mqtt
# does not crash on machines without Jetson hardware.
_gpio_mock = MagicMock()
_gpio_mock.BOARD = 10
_gpio_mock.OUT = 0
_gpio_mock.HIGH = 1
_gpio_mock.LOW = 0
sys.modules.setdefault("Jetson", MagicMock())
sys.modules.setdefault("Jetson.GPIO", _gpio_mock)
