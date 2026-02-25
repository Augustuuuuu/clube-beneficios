from __future__ import annotations

from django.contrib import admin

from . import models


@admin.register(models.Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ("name", "document", "phone", "active", "created_at")
    list_filter = ("active",)
    search_fields = ("name", "document", "phone")


@admin.register(models.CampaignConfig)
class CampaignConfigAdmin(admin.ModelAdmin):
    list_display = ("id", "ttl_minutes", "anti_duplicate", "created_at", "updated_at")


@admin.register(models.Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "partner",
        "enabled",
        "start_at",
        "end_at",
        "tag",
    )
    # list_filter = ("enabled", "partner")
    search_fields = ("title", "description", "tag")


@admin.register(models.Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ("full_name", "whatsapp_e164", "created_at")
    search_fields = ("full_name", "whatsapp_e164")


@admin.register(models.Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "member",
        "plan_name",
        "status",
        "start_date",
        "end_date",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("member__full_name", "plan_name")


@admin.register(models.Redemption)
class RedemptionAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "member",
        "offer",
        "created_at",
        "expires_at",
    )
    list_filter = ("offer",)
    search_fields = ("code", "member__full_name", "member__whatsapp_e164")


@admin.register(models.AdminAccessLog)
class AdminAccessLogAdmin(admin.ModelAdmin):
    list_display = ("role", "ip_address", "created_at")
    list_filter = ("role",)
    search_fields = ("role", "ip_address", "user_agent")

