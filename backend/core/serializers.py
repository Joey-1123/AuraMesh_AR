from rest_framework import serializers


class SessionCreateSerializer(serializers.Serializer):
    source = serializers.CharField(required=False, default="web-client", max_length=64)


class GestureSerializer(serializers.Serializer):
    sessionId = serializers.CharField(max_length=128)
    userId = serializers.CharField(max_length=128)
    type = serializers.ChoiceField(choices=["pinch", "open_hand", "fist"])
    confidence = serializers.FloatField(required=False, min_value=0, max_value=1)
    spread = serializers.FloatField(required=False, min_value=0, max_value=100)
    velocity = serializers.FloatField(required=False, min_value=0)
    theme = serializers.CharField(required=False, max_length=32)


class MetricsSerializer(serializers.Serializer):
    sessionId = serializers.CharField(max_length=128)
    userId = serializers.CharField(max_length=128)
    fps = serializers.FloatField(min_value=0, max_value=240)
    mode = serializers.CharField(max_length=16)
    hands = serializers.IntegerField(min_value=0, max_value=2)
    signsDetected = serializers.IntegerField(required=False, min_value=0)


class ThemeSerializer(serializers.Serializer):
    theme = serializers.ChoiceField(choices=["Rainbow", "Cyberpunk", "Lava", "Ocean", "Galaxy"])


class SignSerializer(serializers.Serializer):
    sessionId = serializers.CharField(max_length=128)
    userId = serializers.CharField(max_length=128)
    label = serializers.CharField(max_length=32)
    confidence = serializers.FloatField(min_value=0, max_value=1)
    hand = serializers.CharField(required=False, max_length=16)
    transcript = serializers.ListField(child=serializers.CharField(max_length=32), required=False)
    theme = serializers.CharField(required=False, max_length=32)
