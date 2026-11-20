// GENERATED FILE — DO NOT EDIT.
// Regenerate with: node scripts/gen-schema-module.mjs
// Source of truth: packages/schema/schema/contribspec-policy-v1.schema.json

/** The normative ContribSpec policy schema (draft 2020-12), embedded at build time. */
export const policySchemaJson: Record<string, unknown> = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://contribspec.dev/schema/contribspec-policy-v1.json",
  "title": "ContribSpec Contribution Policy v1",
  "description": "Machine-readable definition of a repository's contribution requirements. ContribSpec verifies declared requirements and their evidence; it does not detect authorship and does not attest to the truthfulness of self-declarations.",
  "type": "object",
  "required": [
    "version",
    "project"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x[-_]": true
  },
  "properties": {
    "$schema": {
      "type": "string",
      "description": "Optional editor hint pointing at this schema document."
    },
    "version": {
      "const": 1,
      "description": "Policy format major version. Readers reject versions they do not support."
    },
    "project": {
      "$ref": "#/$defs/project"
    },
    "contributions": {
      "$ref": "#/$defs/contributions"
    },
    "enforcement": {
      "$ref": "#/$defs/enforcement"
    },
    "metadata": {
      "$ref": "#/$defs/metadata"
    }
  },
  "$defs": {
    "requirementLevel": {
      "type": "string",
      "enum": [
        "required",
        "encouraged",
        "optional",
        "not_required"
      ],
      "description": "required: must hold, violation fails. encouraged: recommended, violation is informational. optional: recorded only if provided. not_required: explicitly waived (reported as not applicable)."
    },
    "severity": {
      "type": "string",
      "enum": [
        "error",
        "warning",
        "notice",
        "off"
      ],
      "description": "How a violation of a rule affects the overall result. 'off' disables the rule."
    },
    "aiPolicy": {
      "type": "string",
      "enum": [
        "allow",
        "allow_with_disclosure",
        "require_human_verification",
        "prohibit",
        "advisory_only"
      ],
      "description": "Repository stance on AI-assisted contributions. 'allow_with_disclosure': permitted when disclosed. 'require_human_verification': permitted when a named human takes responsibility and records the verification they performed. 'prohibit': AI-assisted contributions are not accepted. 'advisory_only': guidance without gating."
    },
    "disclosureLocation": {
      "type": "string",
      "enum": [
        "pull_request_body",
        "pull_request_comment",
        "commit_trailer",
        "issue_body",
        "issue_comment",
        "other"
      ]
    },
    "disclosureField": {
      "type": "string",
      "enum": [
        "tools",
        "scope",
        "verification",
        "review_process",
        "other"
      ]
    },
    "checkSource": {
      "type": "string",
      "enum": [
        "check_run",
        "commit_status",
        "any"
      ],
      "default": "any"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120,
      "pattern": "^[^\\u0000-\\u001f\\u007f]+$"
    },
    "project": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "name": {
          "$ref": "#/$defs/name",
          "description": "Human-readable project name."
        },
        "description": {
          "type": "string",
          "maxLength": 500
        },
        "repository": {
          "type": "string",
          "maxLength": 300,
          "description": "Canonical repository identifier, e.g. 'github:owner/repo' or a URL."
        },
        "homepage": {
          "type": "string",
          "maxLength": 500
        }
      }
    },
    "contributions": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "pull_requests": {
          "$ref": "#/$defs/pullRequests"
        },
        "ai_assistance": {
          "$ref": "#/$defs/aiAssistance"
        },
        "accountability": {
          "$ref": "#/$defs/accountability"
        },
        "verification": {
          "$ref": "#/$defs/verification"
        },
        "compliance": {
          "$ref": "#/$defs/compliance"
        }
      }
    },
    "pullRequests": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "issue_reference": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Whether the pull request should reference a tracking issue."
        },
        "max_changed_files": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10000,
          "description": "Upper bound on the number of changed files."
        },
        "max_changed_lines": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000000,
          "description": "Upper bound on total added + removed lines."
        },
        "title_pattern": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "description": "JavaScript regular expression (without flags) the pull request title must match. Capped at 200 characters to bound evaluation cost."
        },
        "body_min_length": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10000,
          "description": "Minimum number of non-whitespace characters in the pull request description."
        }
      }
    },
    "aiAssistance": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "policy": {
          "$ref": "#/$defs/aiPolicy"
        },
        "disclosure_locations": {
          "type": "array",
          "minItems": 1,
          "maxItems": 6,
          "uniqueItems": true,
          "items": {
            "$ref": "#/$defs/disclosureLocation"
          },
          "description": "Where a disclosure may appear. At least one location must be satisfied."
        },
        "required_fields": {
          "type": "array",
          "maxItems": 8,
          "uniqueItems": true,
          "items": {
            "$ref": "#/$defs/disclosureField"
          },
          "description": "What the disclosure must state. 'tools': which tools. 'scope': what the tools produced. 'verification': what the human verified. 'review_process': how the change was reviewed. 'other': free-form (see metadata for details)."
        },
        "attestation_terms": {
          "type": "string",
          "maxLength": 2000,
          "description": "Optional wording maintainers ask contributors to acknowledge when disclosing. Recorded as a claim; ContribSpec does not verify understanding or authorship."
        }
      }
    },
    "accountability": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "human_responsibility": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Whether a named human must take responsibility for the contribution (e.g. by signing off)."
        },
        "human_understanding_attestation": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Whether the contributor should state that they understand the change. Self-attestation is recorded as a claim only."
        }
      }
    },
    "verification": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "required_checks": {
          "type": "array",
          "maxItems": 50,
          "items": {
            "oneOf": [
              {
                "$ref": "#/$defs/name"
              },
              {
                "$ref": "#/$defs/requiredCheck"
              }
            ]
          },
          "description": "Checks that must have passing evidence bound to the exact head commit. A bare string is shorthand for {name, source: 'any'}."
        },
        "require_head_sha_match": {
          "type": "boolean",
          "default": true,
          "description": "When true (default), evidence is only accepted when bound to the evaluated head commit."
        }
      }
    },
    "requiredCheck": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "name": {
          "$ref": "#/$defs/name"
        },
        "source": {
          "$ref": "#/$defs/checkSource"
        },
        "severity": {
          "$ref": "#/$defs/severity"
        },
        "description": {
          "type": "string",
          "maxLength": 500
        }
      }
    },
    "compliance": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "dco": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Developer Certificate of Origin sign-off expectation (Signed-off-by trailers / DCO check)."
        },
        "cla": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Contributor License Agreement expectation (CLA check evidence)."
        },
        "license_confirmation": {
          "$ref": "#/$defs/requirementLevel",
          "description": "Whether the contributor should confirm the contribution is submitted under the project's license."
        }
      }
    },
    "enforcement": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "default_mode": {
          "type": "string",
          "enum": [
            "report",
            "advisory",
            "enforce"
          ],
          "default": "report",
          "description": "report: evaluate and publish findings without gating. advisory: violations are surfaced as warnings. enforce: violations of required rules fail the evaluation."
        },
        "missing_evidence": {
          "type": "string",
          "enum": [
            "report",
            "warn",
            "fail"
          ],
          "default": "report",
          "description": "How requirements that could not be verified are treated. 'report' keeps them as 'missing evidence' (distinct from failure)."
        },
        "severity_overrides": {
          "type": "object",
          "maxProperties": 100,
          "propertyNames": {
            "pattern": "^[A-Z]{2,4}-[0-9]{3}$"
          },
          "additionalProperties": {
            "$ref": "#/$defs/severity"
          },
          "description": "Per-rule severity overrides keyed by rule id (e.g. 'PR-002': 'warning')."
        }
      }
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x[-_]": true
      },
      "properties": {
        "description": {
          "type": "string",
          "maxLength": 1000
        },
        "maintainers": {
          "type": "array",
          "maxItems": 50,
          "items": {
            "type": "string",
            "maxLength": 200
          }
        },
        "last_reviewed": {
          "type": "string",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
          "description": "ISO date (YYYY-MM-DD) of the last policy review."
        }
      }
    }
  }
} as Record<string, unknown>;
