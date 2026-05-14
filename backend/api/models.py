from django.db import models


class User(models.Model):
    ROLE_CHOICES = (
        ("admin",    "Admin"),
        ("reseller", "Reseller"),
        ("user",     "User"),
    )

    username = models.CharField(max_length=100, unique=True)
    password = models.CharField(max_length=255)
    role     = models.CharField(max_length=20, choices=ROLE_CHOICES, default="user")
    parent   = models.ForeignKey(
        "self", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="children"
    )
    credit = models.IntegerField(default=0)
    status = models.CharField(max_length=10, default="Active")
    created_at = models.DateTimeField(auto_now_add=True)

    def is_admin(self):
        return self.role == "admin"

    def save(self, *args, **kwargs):
        # Admin ka credit kabhi negative nahi hoga (unlimited treat hota hai)
        if self.role != "admin" and self.credit < 0:
            self.credit = 0
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role}) - {self.credit} cr"


class CreditLog(models.Model):
    ACTION_CHOICES = (
        ("credit", "Credit"),
        ("debit",  "Debit"),
    )
    from_user   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="sent_logs")
    to_user     = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="received_logs")
    action      = models.CharField(max_length=10, choices=ACTION_CHOICES)
    amount      = models.IntegerField()
    description = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} {self.amount} | {self.from_user} → {self.to_user}"
class Campaign(models.Model):
    STATUS_CHOICES = (
        ("pending",   "Pending"),
        ("completed", "Completed"),
    )

    user          = models.ForeignKey(User, on_delete=models.CASCADE)
    campaign_name = models.CharField(max_length=255, blank=True, default="")  # ← NEW
    message       = models.TextField()
    total         = models.IntegerField(default=0)
    success       = models.IntegerField(default=0)
    failed        = models.IntegerField(default=0)
    status        = models.CharField(                                          # ← NEW
        max_length=20,
        choices=STATUS_CHOICES,
        default="completed"
    )
    created_at    = models.DateTimeField(auto_now_add=True)
    results       = models.JSONField(default=list, blank=True)
    number_list = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.campaign_name} - {self.status}"