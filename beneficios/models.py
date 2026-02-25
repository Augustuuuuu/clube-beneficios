from __future__ import annotations

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        abstract = True


class Partner(TimeStampedModel):
    """Empresa parceira que oferece benefícios."""

    name = models.CharField("nome", max_length=150)
    document = models.CharField(
        "CNPJ/Documento",
        max_length=32,
        blank=True,
    )
    phone = models.CharField("telefone", max_length=20, blank=True)
    email = models.EmailField("e-mail", blank=True)
    website = models.URLField("site", blank=True)
    address = models.CharField("endereço", max_length=255, blank=True)
    active = models.BooleanField("ativo", default=True)

    class Meta:
        verbose_name = "empresa parceira"
        verbose_name_plural = "empresas parceiras"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CampaignConfig(TimeStampedModel):
    """Configuração global da campanha (regras e textos)."""

    ttl_minutes = models.PositiveIntegerField(
        "validade padrão do código (minutos)",
        default=120,
        help_text="Quanto tempo um código de resgate permanece válido.",
    )
    anti_duplicate = models.BooleanField(
        "evitar duplicidade por oferta + telefone",
        default=True,
    )
    terms_text = models.TextField("termos e regras", blank=True)
    mission_text = models.TextField("missão bônus", blank=True)

    class Meta:
        verbose_name = "configuração de campanha"
        verbose_name_plural = "configurações de campanha"

    def __str__(self) -> str:
        return f"Config #{self.pk} (ttl={self.ttl_minutes} min)"


class Offer(TimeStampedModel):
    """Benefício/oferta disponível para resgate."""

    partner = models.ForeignKey(
        Partner,
        verbose_name="parceiro",
        related_name="offers",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    title = models.CharField("título", max_length=120)
    description = models.TextField("descrição", blank=True)
    enabled = models.BooleanField("ativa", default=True)

    tag = models.CharField(
        "tag curta",
        max_length=16,
        default="OFERTA",
        help_text="Ex.: VIP, COMBO, DIA, etc.",
    )

    start_at = models.DateTimeField("início da janela", null=True, blank=True)
    end_at = models.DateTimeField("fim da janela", null=True, blank=True)

    cta_text = models.CharField(
        "texto do botão (opcional)",
        max_length=40,
        blank=True,
    )
    cta_url = models.URLField(
        "URL do botão (opcional)",
        max_length=300,
        blank=True,
    )

    class Meta:
        verbose_name = "oferta"
        verbose_name_plural = "ofertas"
        ordering = ["-enabled", "start_at", "title"]

    def __str__(self) -> str:
        return self.title


class Member(TimeStampedModel):
    """Usuário/cliente que resgata benefícios."""

    full_name = models.CharField("nome completo", max_length=120)
    whatsapp_e164 = models.CharField(
        "WhatsApp em E.164",
        max_length=16,
        unique=True,
        help_text="Formato internacional, ex.: 5511999999999.",
    )

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.whatsapp_e164})"


class Subscription(TimeStampedModel):
    """Assinatura do usuário em um plano do clube."""

    STATUS_ACTIVE = "active"
    STATUS_CANCELED = "canceled"
    STATUS_EXPIRED = "expired"

    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Ativa"),
        (STATUS_CANCELED, "Cancelada"),
        (STATUS_EXPIRED, "Expirada"),
    ]

    member = models.ForeignKey(
        Member,
        verbose_name="usuário",
        related_name="subscriptions",
        on_delete=models.CASCADE,
    )
    plan_name = models.CharField("plano", max_length=80)
    status = models.CharField(
        "status",
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    start_date = models.DateField("início", null=True, blank=True)
    end_date = models.DateField("fim", null=True, blank=True)

    class Meta:
        verbose_name = "assinatura"
        verbose_name_plural = "assinaturas"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.plan_name} - {self.member}"


class Redemption(TimeStampedModel):
    """Resgate de benefício realizado por um usuário."""

    member = models.ForeignKey(
        Member,
        verbose_name="usuário",
        related_name="redemptions",
        on_delete=models.CASCADE,
    )
    offer = models.ForeignKey(
        Offer,
        verbose_name="oferta",
        related_name="redemptions",
        on_delete=models.PROTECT,
    )

    code = models.CharField("código gerado", max_length=64, db_index=True)
    tag_snapshot = models.CharField(
        "tag no momento do resgate",
        max_length=16,
        blank=True,
    )
    offer_title_snapshot = models.CharField(
        "título da oferta no resgate",
        max_length=120,
        blank=True,
    )
    phone_snapshot = models.CharField(
        "telefone no resgate",
        max_length=20,
        blank=True,
    )

    expires_at = models.DateTimeField("expira em")

    class Meta:
        verbose_name = "resgate"
        verbose_name_plural = "resgates"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["member", "offer"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.member}"


class AdminAccessLog(models.Model):
    """Registro simples de acessos ao painel admin/gerente."""

    role = models.CharField("papel", max_length=20)
    created_at = models.DateTimeField("data/hora", auto_now_add=True)
    ip_address = models.GenericIPAddressField("IP", null=True, blank=True)
    user_agent = models.TextField("user agent", blank=True)

    class Meta:
        verbose_name = "log de acesso admin"
        verbose_name_plural = "logs de acesso admin"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.role} @ {self.created_at:%d/%m/%Y %H:%M}"

