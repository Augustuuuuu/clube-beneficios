# APIs públicas para o frontend: ofertas, campanha e resgate.
from __future__ import annotations

import json
import re
from datetime import timedelta
from secrets import token_hex

from django.http import JsonResponse
from django.utils import timezone as dj_timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from . import models


def _e164_br(raw: str) -> str | None:
    """Normaliza telefone para E.164 (55 + DDD + número). Retorna None se inválido."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("55") and len(digits) >= 12:
        core = digits[:13]
    elif len(digits) in (10, 11):
        core = "55" + digits
    else:
        return None
    if len(core) < 12:
        return None
    return core


@require_http_methods(["GET"])
@ensure_csrf_cookie
def api_offers(_request):
    """Lista ofertas ativas (janela de tempo e enabled)."""
    now = dj_timezone.now()
    qs = models.Offer.objects.filter(enabled=True).select_related("partner").order_by("start_at", "title")
    out = []
    for o in qs:
        start_ok = o.start_at is None or o.start_at <= now
        end_ok = o.end_at is None or o.end_at >= now
        if not (start_ok and end_ok):
            continue
        out.append({
            "id": o.pk,
            "title": o.title,
            "description": o.description or "",
            "tag": o.tag or "OFERTA",
            "start_at": o.start_at.isoformat() if o.start_at else None,
            "end_at": o.end_at.isoformat() if o.end_at else None,
            "cta_text": o.cta_text or "",
            "cta_url": o.cta_url or "",
            "partner_name": o.partner.name if o.partner else "",
        })
    return JsonResponse({"offers": out, "updated_at": now.isoformat()})


@require_http_methods(["GET"])
@ensure_csrf_cookie
def api_campaign(_request):
    """Retorna configuração da campanha (uma linha ou padrão)."""
    cfg = models.CampaignConfig.objects.first()
    if cfg:
        return JsonResponse({
            "ttl_minutes": cfg.ttl_minutes,
            "anti_duplicate": cfg.anti_duplicate,
            "terms_text": cfg.terms_text or "",
            "mission_text": cfg.mission_text or "",
            "updated_at": cfg.updated_at.isoformat(),
        })
    return JsonResponse({
        "ttl_minutes": 120,
        "anti_duplicate": True,
        "terms_text": "",
        "mission_text": "",
        "updated_at": dj_timezone.now().isoformat(),
    })


@require_http_methods(["GET", "POST"])
@ensure_csrf_cookie
def api_redeem(request):
    """POST: cria resgate (membro + código). GET apenas para preflight/options."""
    if request.method != "POST":
        return JsonResponse({"detail": "Use POST com offer_id, full_name, whatsapp."}, status=405)

    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}
    offer_id = body.get("offer_id")
    full_name = (body.get("full_name") or "").strip()[:120]
    whatsapp_raw = (body.get("whatsapp") or body.get("whatsapp_e164") or "").strip()

    if not offer_id or not full_name or not whatsapp_raw:
        return JsonResponse(
            {"error": "Faltam offer_id, full_name ou whatsapp."},
            status=400,
        )
    phone = _e164_br(whatsapp_raw)
    if not phone:
        return JsonResponse(
            {"error": "WhatsApp inválido. Use DDD + número."},
            status=400,
        )

    try:
        offer = models.Offer.objects.get(pk=offer_id, enabled=True)
    except models.Offer.DoesNotExist:
        return JsonResponse({"error": "Oferta não encontrada ou inativa."}, status=404)

    now = dj_timezone.now()
    if offer.start_at and offer.start_at > now:
        return JsonResponse({"error": "Oferta ainda não está no período de resgate."}, status=400)
    if offer.end_at and offer.end_at < now:
        return JsonResponse({"error": "Oferta fora do período de resgate."}, status=400)

    cfg = models.CampaignConfig.objects.first()
    ttl_minutes = (cfg.ttl_minutes or 120) if cfg else 120
    anti_dup = cfg.anti_duplicate if cfg else True

    member, _ = models.Member.objects.get_or_create(
        whatsapp_e164=phone,
        defaults={"full_name": full_name},
    )
    if not _:
        member.full_name = full_name
        member.save(update_fields=["full_name"])

    if anti_dup:
        existing = (
            models.Redemption.objects.filter(
                member=member,
                offer=offer,
                expires_at__gt=now,
            )
            .order_by("-created_at")
            .first()
        )
        if existing:
            return JsonResponse({
                "code": existing.code,
                "tag": existing.tag_snapshot or offer.tag,
                "expires_at": existing.expires_at.isoformat(),
                "reused": True,
                "message": "Código já existente para esta oferta e WhatsApp.",
            })

    expires_at = now + timedelta(minutes=ttl_minutes)
    tag = (offer.tag or "OFERTA")[:16]
    code = f"CBO-{tag}-{token_hex(4).upper()}-{token_hex(2).upper()}"

    red = models.Redemption.objects.create(
        member=member,
        offer=offer,
        code=code,
        tag_snapshot=tag,
        offer_title_snapshot=offer.title,
        phone_snapshot=phone,
        expires_at=expires_at,
    )
    return JsonResponse({
        "code": red.code,
        "tag": red.tag_snapshot,
        "expires_at": red.expires_at.isoformat(),
        "offer_title": red.offer_title_snapshot,
        "reused": False,
    })
