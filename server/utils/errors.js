'use strict';

/**
 * Typed errors let the service layer throw without knowing anything about HTTP,
 * and let one error middleware map every case cleanly.
 */
class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (field) this.field = field;
  }

  toEnvelope() {
    const error = { code: this.code, message: this.message };
    if (this.field) error.field = this.field;
    return { error };
  }
}

class ValidationError extends ApiError {
  constructor(code, message, field) {
    super(400, code, message, field);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'No short link with that code.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

class ExpiredLinkError extends ApiError {
  constructor(message = 'This short link has expired.') {
    super(410, 'EXPIRED', message);
    this.name = 'ExpiredLinkError';
  }
}

class CodeGenerationError extends ApiError {
  constructor() {
    super(500, 'CODE_GENERATION_FAILED', 'Could not generate a unique short code. Please try again.');
    this.name = 'CodeGenerationError';
  }
}

class ServiceUnavailableError extends ApiError {
  constructor() {
    super(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again.');
    this.name = 'ServiceUnavailableError';
  }
}

module.exports = {
  ApiError,
  ValidationError,
  NotFoundError,
  ExpiredLinkError,
  CodeGenerationError,
  ServiceUnavailableError,
};
