function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function typeMatches(value, type) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function resolveLocalRef(rootSchema, reference) {
  if (!reference.startsWith("#/")) throw new Error(`Only local JSON Schema references are supported: ${reference}`);
  return reference.slice(2).split("/").reduce((value, token) => {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    return value?.[key];
  }, rootSchema);
}

function validateNode(value, schema, rootSchema, instancePath, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${instancePath} is not allowed`);
    return;
  }
  if (schema.$ref) {
    const target = resolveLocalRef(rootSchema, schema.$ref);
    if (!target) errors.push(`${instancePath} references missing schema ${schema.$ref}`);
    else validateNode(value, target, rootSchema, instancePath, errors);
    return;
  }
  if (schema.const !== undefined && !jsonEqual(value, schema.const)) {
    errors.push(`${instancePath} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((type) => typeMatches(value, type))) {
      errors.push(`${instancePath} must be ${allowed.join(" or ")}`);
      return;
    }
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${instancePath} is shorter than ${schema.minLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${instancePath} does not match ${schema.pattern}`);
    if (schema.format === "date-time" && (!Number.isFinite(Date.parse(value)) || !/[tT]/.test(value))) {
      errors.push(`${instancePath} is not a valid date-time`);
    }
  }
  if (typeof value === "number" && schema.minimum != null && value < schema.minimum) {
    errors.push(`${instancePath} is below ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${instancePath} has fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${instancePath} has more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${instancePath} contains duplicate items`);
    const prefix = schema.prefixItems ?? [];
    for (let index = 0; index < Math.min(prefix.length, value.length); index++) {
      validateNode(value[index], prefix[index], rootSchema, `${instancePath}/${index}`, errors);
    }
    for (let index = prefix.length; index < value.length; index++) {
      if (schema.items !== undefined) validateNode(value[index], schema.items, rootSchema, `${instancePath}/${index}`, errors);
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${instancePath}/${key} is required`);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) validateNode(child, properties[key], rootSchema, `${instancePath}/${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${instancePath}/${key} is not allowed`);
      else if (isObject(schema.additionalProperties)) validateNode(child, schema.additionalProperties, rootSchema, `${instancePath}/${key}`, errors);
    }
  }
}

export function validateJsonSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, schema, "$", errors);
  return errors;
}

export function assertJsonSchema(value, schema, label = "JSON document") {
  const errors = validateJsonSchema(value, schema);
  if (errors.length) throw new Error(`${label} does not satisfy its JSON Schema: ${errors.join("; ")}`);
  return value;
}
