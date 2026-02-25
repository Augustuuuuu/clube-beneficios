from __future__ import annotations

from django.http import JsonResponse
from django.urls import path


def api_root(_request):
    return JsonResponse({"name": "clube-beneficios-api", "version": 1})


urlpatterns = [
    path("", api_root, name="api-root"),
]

