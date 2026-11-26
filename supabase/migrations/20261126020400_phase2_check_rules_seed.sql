-- Phase 2: global check rule packs (BUILD_PLAN §3.5 items 1-11) as DATA.
-- Generated from src/server/checks/default-rules.ts; tests/unit/checks-seed.test.ts keeps them identical.
-- Orgs override a rule by adding a row with the same rule_key (Settings > Checks).
insert into public.check_rules (org_id, rule_key, pack, title, severity, params, version, active)
select null, r.rule_key, r.pack, r.title, r.severity, r.params, 1, true
from jsonb_to_recordset($rules$
[
  {
    "rule_key": "required.fields",
    "pack": "1_required_fields",
    "title": "Required fields per marketplace / draft type",
    "severity": "blocker",
    "params": {
      "profiles": {
        "listing": {
          "amazon": [
            "title",
            "bullets",
            "description"
          ],
          "walmart": [
            "title",
            "description"
          ],
          "shopify": [
            "title",
            "description"
          ],
          "openai_feed": [
            "item_id",
            "title",
            "description",
            "url",
            "brand",
            "image_url",
            "price",
            "availability"
          ],
          "other": [
            "title"
          ]
        },
        "gbp_description": [
          "body"
        ],
        "gbp_post": [
          "body"
        ],
        "review_reply": [
          "body"
        ],
        "review_request": [
          "body"
        ],
        "sms": [
          "body"
        ],
        "email": [
          "subject",
          "body"
        ],
        "other": [
          "body"
        ]
      }
    }
  },
  {
    "rule_key": "length.limits",
    "pack": "2_length",
    "title": "Length limits",
    "severity": "blocker",
    "params": {
      "limits": [
        {
          "kind": "listing",
          "marketplace": "amazon",
          "field": "title",
          "max": 200,
          "verify": true
        },
        {
          "kind": "listing",
          "marketplace": "amazon",
          "field": "bullets",
          "maxItems": 5,
          "maxEach": 500,
          "verify": true
        },
        {
          "kind": "listing",
          "marketplace": "walmart",
          "field": "title",
          "max": 150,
          "verify": true
        },
        {
          "kind": "gbp_description",
          "field": "body",
          "max": 750
        },
        {
          "kind": "gbp_post",
          "field": "body",
          "max": 1500
        },
        {
          "kind": "review_reply",
          "field": "body",
          "max": 4096,
          "verify": true
        }
      ]
    }
  },
  {
    "rule_key": "sms.segments",
    "pack": "2_length",
    "title": "SMS segment count (GSM-7 160 / UCS-2 70)",
    "severity": "warning",
    "params": {
      "kinds": [
        "sms"
      ],
      "warn_above": 2
    }
  },
  {
    "rule_key": "claims.guaranteed",
    "pack": "3_banned_claims",
    "title": "Guaranteed rankings or results",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "guarantee(?:d|s)?\\s+(?:a\\s+|the\\s+|you\\s+)?(?:#\\s?1|number\\s+one|first[- ]page|top\\s+(?:spot|ranking|position)|rank(?:ing|ings)?|results|more\\s+sales|sales|leads|first\\s+place)",
        "\\brank(?:s|ed)?\\s+(?:you\\s+)?(?:#\\s?1|first|number\\s+one)\\b",
        "#\\s?1\\s+(?:ranking|on\\s+google|in\\s+google|on\\s+amazon|spot)"
      ]
    }
  },
  {
    "rule_key": "claims.superlatives",
    "pack": "3_banned_claims",
    "title": "Unverifiable superlatives without substantiation",
    "severity": "warning",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "\\bthe\\s+best\\b",
        "\\bbest[- ]in[- ]class\\b",
        "(?<![\\w])#\\s?1\\b",
        "\\bnumber\\s+one\\b",
        "\\bworld'?s\\s+(?:best|leading)\\b"
      ]
    }
  },
  {
    "rule_key": "claims.medical",
    "pack": "3_banned_claims",
    "title": "Medical, disease or cure claims",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "\\bcures?\\b",
        "\\bheals?\\b",
        "\\btreats?\\s+(?:\\w+\\s+){0,2}(?:disease|anxiety|depression|insomnia|cancer|arthritis|infection)",
        "\\bprevents?\\s+(?:\\w+\\s+){0,2}(?:disease|cancer|covid|flu|infection)",
        "\\b(?:relieves|reduces)\\s+(?:\\w+\\s+){0,2}(?:anxiety|depression|pain|inflammation)",
        "\\bclinically\\s+proven\\b"
      ]
    }
  },
  {
    "rule_key": "claims.fda",
    "pack": "3_banned_claims",
    "title": "FDA approved / certified",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "\\bFDA[- ](?:approved|certified|registered|cleared)\\b",
        "\\bapproved\\s+by\\s+(?:the\\s+)?FDA\\b"
      ]
    }
  },
  {
    "rule_key": "claims.pesticide",
    "pack": "3_banned_claims",
    "title": "Pesticide or antimicrobial claims",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "\\bantimicrobial\\b",
        "\\bantibacterial\\b",
        "\\banti-?viral\\b",
        "\\bkills?\\s+(?:\\d+(?:\\.\\d+)?%\\s+of\\s+)?(?:germs|bacteria|viruses|mold|fleas|ticks|insects|pests)\\b",
        "\\bdisinfect(?:s|ant|ing)?\\b",
        "\\bsanitiz(?:es|er|ing)\\b",
        "\\bpesticide\\b"
      ]
    }
  },
  {
    "rule_key": "claims.competitors",
    "pack": "3_banned_claims",
    "title": "Competitor brand names (list per org)",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing"
      ],
      "names": []
    }
  },
  {
    "rule_key": "claims.title_promo",
    "pack": "3_banned_claims",
    "title": "Promo, price or shipping text in titles",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing"
      ],
      "fields": [
        "title"
      ],
      "patterns": [
        "\\bfree\\s+shipping\\b",
        "\\bon\\s+sale\\b",
        "\\bsale\\b",
        "\\d+\\s?%\\s?off\\b",
        "\\bdiscount\\b",
        "\\bbest\\s?seller\\b",
        "\\$\\s?\\d",
        "\\bfree\\b",
        "\\bdeal\\b"
      ]
    }
  },
  {
    "rule_key": "claims.all_caps",
    "pack": "3_banned_claims",
    "title": "ALL CAPS words",
    "severity": "warning",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post"
      ],
      "min_length": 4,
      "allow": [
        "USB",
        "LED",
        "HDMI",
        "USA",
        "UPC",
        "SKU",
        "NAPA",
        "AAFES",
        "HVAC",
        "BBQ",
        "ASAP",
        "FAQ",
        "UV",
        "GFCI",
        "OSHA",
        "NSF",
        "ANSI",
        "ISO"
      ]
    }
  },
  {
    "rule_key": "claims.emoji",
    "pack": "3_banned_claims",
    "title": "Emoji in Amazon content",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing"
      ],
      "marketplaces": [
        "amazon"
      ]
    }
  },
  {
    "rule_key": "spec.fidelity",
    "pack": "4_spec_fidelity",
    "title": "Numeric specs must match the source data",
    "severity": "blocker",
    "params": {
      "kinds": [
        "listing"
      ],
      "units": [
        "lbs?",
        "pounds?",
        "kg",
        "kilograms?",
        "g",
        "grams?",
        "oz",
        "ounces?",
        "in",
        "inch(?:es)?",
        "\"",
        "ft",
        "feet",
        "foot",
        "cm",
        "mm",
        "m",
        "meters?",
        "gal",
        "gallons?",
        "l",
        "liters?",
        "ml",
        "qt",
        "v",
        "volts?",
        "w",
        "watts?",
        "amps?",
        "mah",
        "psi",
        "hours?",
        "hrs?",
        "count",
        "ct",
        "pack",
        "pcs?",
        "pieces?",
        "°f",
        "°c"
      ]
    }
  },
  {
    "rule_key": "reviews.gating",
    "pack": "5_reviews",
    "title": "Review gating (Google policy, FTC 16 CFR Part 465)",
    "severity": "blocker",
    "params": {
      "kinds": [
        "review_request",
        "sms",
        "email",
        "gbp_post",
        "other"
      ],
      "patterns": [
        "\\bif\\s+you\\s+(?:loved|liked|enjoyed|were\\s+happy|are\\s+happy|had\\s+a\\s+(?:great|good|positive))",
        "\\bif\\s+you(?:'re|\\s+are|\\s+were)\\s+(?:satisfied|pleased|happy)",
        "\\botherwise\\s+(?:call|contact|email|text|reach)",
        "\\bif\\s+(?:you(?:'re|\\s+are)\\s+)?not\\s+(?:happy|satisfied)[^.]{0,40}(?:call|contact|email|text|let\\s+us\\s+know)",
        "\\brate\\s+us\\s+(?:here\\s+)?first\\b",
        "\\bbefore\\s+(?:you\\s+)?(?:leave|leaving|post|posting)\\s+a\\s+review"
      ]
    }
  },
  {
    "rule_key": "reviews.incentive",
    "pack": "5_reviews",
    "title": "Incentives for reviews",
    "severity": "blocker",
    "params": {
      "kinds": [
        "review_request",
        "sms",
        "email",
        "gbp_post",
        "other"
      ],
      "patterns": [
        "(?:\\d+\\s?%\\s?off|discount|coupon|gift\\s?card|free\\s+\\w+|entry|entries|prize|reward|giveaway|raffle)[^.]{0,60}\\b(?:for|when\\s+you|if\\s+you)\\s+(?:leaving|leave|writing|write|posting|post)\\s+(?:us\\s+)?(?:a\\s+)?(?:\\d-star\\s+)?review",
        "\\breview[^.]{0,40}\\b(?:get|receive|earn|win)\\s+(?:a\\s+)?(?:\\d+\\s?%\\s?off|discount|coupon|gift\\s?card|free|entry|prize|reward)",
        "\\bin\\s+exchange\\s+for\\s+(?:a\\s+|your\\s+)?review"
      ]
    }
  },
  {
    "rule_key": "reviews.positive_only",
    "pack": "5_reviews",
    "title": "Asking for positive reviews only",
    "severity": "blocker",
    "params": {
      "kinds": [
        "review_request",
        "sms",
        "email",
        "gbp_post",
        "other"
      ],
      "patterns": [
        "\\b(?:5|five)[- ]?stars?\\b",
        "\\bpositive\\s+review",
        "\\bgood\\s+review",
        "\\bgreat\\s+review"
      ]
    }
  },
  {
    "rule_key": "review_reply.personal_data",
    "pack": "6_review_replies",
    "title": "No customer personal data in replies",
    "severity": "blocker",
    "params": {
      "kinds": [
        "review_reply"
      ],
      "patterns": [
        "\\(?\\b\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b",
        "[\\w.+-]+@[\\w-]+\\.[\\w.]+",
        "\\border\\s*(?:#|no\\.?|number)\\s*[\\w-]{3,}",
        "#\\d{4,}",
        "\\b(?:diagnos\\w*|prescription|medication|treatment\\s+plan)\\b"
      ]
    }
  },
  {
    "rule_key": "review_reply.tone",
    "pack": "6_review_replies",
    "title": "No arguing in review replies",
    "severity": "warning",
    "params": {
      "kinds": [
        "review_reply"
      ],
      "patterns": [
        "\\byou(?:'re|\\s+are)\\s+wrong\\b",
        "\\bliar\\b",
        "\\blying\\b",
        "\\bfake\\s+review\\b",
        "\\bnever\\s+happened\\b",
        "\\bridiculous\\b",
        "\\bobviously\\b"
      ]
    }
  },
  {
    "rule_key": "gbp.contact_in_post",
    "pack": "7_gbp",
    "title": "Phone numbers or URLs in GBP post bodies",
    "severity": "warning",
    "params": {
      "kinds": [
        "gbp_post",
        "gbp_description"
      ],
      "patterns": [
        "\\(?\\b\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b",
        "\\bhttps?://\\S+",
        "\\bwww\\.\\S+"
      ]
    }
  },
  {
    "rule_key": "sms.stop",
    "pack": "8_sms",
    "title": "Opt-out wording on the first message",
    "severity": "blocker",
    "params": {
      "kinds": [
        "sms"
      ],
      "pattern": "reply\\s+stop"
    }
  },
  {
    "rule_key": "sms.brand",
    "pack": "8_sms",
    "title": "Sender brand named in the message",
    "severity": "blocker",
    "params": {
      "kinds": [
        "sms"
      ]
    }
  },
  {
    "rule_key": "sms.shortener",
    "pack": "8_sms",
    "title": "No public URL shorteners",
    "severity": "blocker",
    "params": {
      "kinds": [
        "sms"
      ],
      "patterns": [
        "\\b(?:bit\\.ly|tinyurl\\.com|t\\.co|goo\\.gl|ow\\.ly|is\\.gd|buff\\.ly|rebrand\\.ly|cutt\\.ly|shorturl\\.at)/"
      ]
    }
  },
  {
    "rule_key": "sms.shaft",
    "pack": "8_sms",
    "title": "SHAFT content (sex, hate, alcohol, firearms, tobacco/cannabis)",
    "severity": "warning",
    "params": {
      "kinds": [
        "sms"
      ],
      "patterns": [
        "\\b(?:beer|wine|liquor|vodka|whiskey|tequila|cocktails?)\\b",
        "\\b(?:guns?|firearms?|ammo|ammunition|rifles?|pistols?)\\b",
        "\\b(?:vape|vaping|cigarettes?|cigars?|tobacco|nicotine|cannabis|marijuana|cbd|thc)\\b",
        "\\b(?:sex|sexy|xxx|adult\\s+content)\\b"
      ]
    }
  },
  {
    "rule_key": "email.canspam",
    "pack": "9_email",
    "title": "CAN-SPAM: unsubscribe link and postal address",
    "severity": "blocker",
    "params": {
      "kinds": [
        "email"
      ],
      "unsubscribe_pattern": "unsubscribe",
      "address_pattern": "(?:\\d+\\s+[\\w .]+\\s(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|hwy|highway|pkwy|parkway)\\b|p\\.?\\s?o\\.?\\s+box\\s+\\d+)"
    }
  },
  {
    "rule_key": "honesty.urgency",
    "pack": "10_honesty",
    "title": "Fake urgency",
    "severity": "warning",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "\\bact\\s+now\\b",
        "\\bonly\\s+today\\b",
        "\\blast\\s+chance\\b",
        "\\blimited\\s+time\\b",
        "\\bhurry\\b",
        "\\bexpires\\s+(?:today|tonight|soon)\\b",
        "\\bonly\\s+\\d+\\s+left\\b"
      ]
    }
  },
  {
    "rule_key": "honesty.statistics",
    "pack": "10_honesty",
    "title": "Statistics need a source note",
    "severity": "warning",
    "params": {
      "kinds": [
        "review_request",
        "sms",
        "email",
        "gbp_post",
        "other",
        "gbp_description"
      ],
      "patterns": [
        "\\b\\d+(?:\\.\\d+)?\\s?%(?!\\s?off)",
        "\\b\\d+\\s+out\\s+of\\s+\\d+\\b",
        "\\b\\d+x\\s+(?:more|faster|better)\\b"
      ]
    }
  },
  {
    "rule_key": "honesty.testimonial",
    "pack": "10_honesty",
    "title": "Testimonials need a source note",
    "severity": "warning",
    "params": {
      "kinds": [
        "listing",
        "gbp_description",
        "gbp_post",
        "review_reply",
        "review_request",
        "sms",
        "email",
        "other"
      ],
      "patterns": [
        "[\"“][^\"”]{10,}[\"”]\\s*[—–-]\\s*[A-Z][a-z]+"
      ]
    }
  },
  {
    "rule_key": "data.secrets",
    "pack": "11_data_safety",
    "title": "Secrets (API keys, private keys)",
    "severity": "blocker",
    "params": {
      "patterns": [
        "\\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}",
        "\\bAKIA[0-9A-Z]{16}\\b",
        "\\bgh[pousr]_[A-Za-z0-9]{30,}",
        "\\bxox[abprs]-[A-Za-z0-9-]{10,}",
        "\\bAIza[0-9A-Za-z_-]{30,}",
        "-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
        "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}"
      ]
    }
  },
  {
    "rule_key": "data.card_number",
    "pack": "11_data_safety",
    "title": "Payment card numbers",
    "severity": "blocker",
    "params": {}
  },
  {
    "rule_key": "data.ssn",
    "pack": "11_data_safety",
    "title": "US Social Security numbers",
    "severity": "blocker",
    "params": {
      "patterns": [
        "\\b(?!000|666|9\\d\\d)\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}\\b"
      ]
    }
  }
]
$rules$::jsonb) as r(rule_key text, pack text, title text, severity text, params jsonb);
