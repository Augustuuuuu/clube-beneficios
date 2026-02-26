from __future__ import annotations

from django.http import JsonResponse
from django.urls import path

from . import views


def api_root(_request):
    return JsonResponse({"name": "clube-beneficios-api", "version": 1})


urlpatterns = [
    path("", api_root, name="api-root"),
    path("offers/", views.api_offers, name="api-offers"),
    path("campaign/", views.api_campaign, name="api-campaign"),
    path("redeem/", views.api_redeem, name="api-redeem"),
]

