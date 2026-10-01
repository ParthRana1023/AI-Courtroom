from pydantic import BaseModel, model_validator


class EvidenceExtractRequest(BaseModel):
    """What to turn into evidence: a party's chat reply or a witness's answer.

    The server reads the text from the case itself, so a user can't submit
    their own words as evidence.
    """

    party_id: str | None = None
    message_id: str | None = None
    event_id: str | None = None

    @model_validator(mode="after")
    def one_source(self):
        from_chat = bool(self.party_id and self.message_id)
        if from_chat == bool(self.event_id):
            raise ValueError("Give either party_id and message_id, or event_id.")
        return self


class EvidenceGenerationSummary(BaseModel):
    limit: int
    already_generated: int
    attempted: int = 0
    generated: int = 0
    failed: int = 0
    skipped: int = 0
    message: str = ""
