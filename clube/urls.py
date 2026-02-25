from __future__ import annotations

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic import TemplateView # Adicionado

def healthcheck(_request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", healthcheck, name="healthcheck"),
    path("api/", include("beneficios.urls")),
    # Adicionado para servir o index.html na raiz do site
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
]