import json
from channels.generic.websocket import AsyncWebsocketConsumer

websocket_urlpatterns = []


class AuraMeshConsumer(AsyncWebsocketConsumer):
    group_name = "auramesh.events"

    async def connect(self):
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        return

    async def broadcast_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))


from django.urls import re_path

websocket_urlpatterns = [
    re_path(r"^ws/?$", AuraMeshConsumer.as_asgi()),
]

