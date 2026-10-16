const MAX_STYLES_PER_BIN = 20;
const MAX_STYLE_NAME_LENGTH = 80;

export function normalizeBinAnswers(rawAnswers, bins, { photosDisabled = false } = {}) {
  const fieldErrors = {};
  if (!Array.isArray(rawAnswers)) {
    return {
      answers: [],
      fieldErrors: { answers: 'Answer Yes or No for each of the 28 bins.' }
    };
  }

  const binsByNumber = new Map(bins.map((bin) => [bin.number, bin]));
  const answerByNumber = new Map();
  const setBinError = (binId, message) => {
    if (!fieldErrors[binId]) fieldErrors[binId] = message;
  };

  for (const answer of rawAnswers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !Number.isInteger(answer.bin)) {
      fieldErrors.answers = 'One or more bin answers are not valid.';
      continue;
    }
    const bin = binsByNumber.get(answer.bin);
    if (!bin) {
      fieldErrors.answers = 'A response referred to a bin outside this form.';
      continue;
    }
    if (answerByNumber.has(bin.number)) {
      setBinError(bin.id, 'This bin was included more than once. Refresh the form and try again.');
      continue;
    }
    answerByNumber.set(bin.number, answer);
  }

  if (rawAnswers.length !== bins.length) {
    fieldErrors.answers = 'Exactly one answer is required for each of the 28 bins.';
  }

  const normalizedAnswers = [];
  for (const bin of bins) {
    const answer = answerByNumber.get(bin.number);
    if (!answer) {
      setBinError(bin.id, 'Tap Yes or No for this bin.');
      continue;
    }
    if (!['needed', 'not_needed'].includes(answer.status)) {
      setBinError(bin.id, 'Tap Yes or No for this bin.');
      continue;
    }

    const rawStyleNames = answer.styleNames === undefined ? [] : answer.styleNames;
    const styleNames = [];
    if (!Array.isArray(rawStyleNames)) {
      setBinError(bin.id, 'Enter style names as a list of text values.');
    } else {
      if (rawStyleNames.length > MAX_STYLES_PER_BIN) {
        setBinError(bin.id, `Use no more than ${MAX_STYLES_PER_BIN} style names for one bin.`);
      }
      for (const rawName of rawStyleNames.slice(0, MAX_STYLES_PER_BIN)) {
        if (typeof rawName !== 'string') {
          setBinError(bin.id, 'Each topping/style name must be text.');
          continue;
        }
        const name = rawName.trim().replace(/\s+/g, ' ');
        if (!name) continue;
        if (name.length > MAX_STYLE_NAME_LENGTH) {
          setBinError(bin.id, 'Each topping/style name must be 80 characters or fewer.');
          continue;
        }
        styleNames.push(name);
      }
    }

    let photoUrl;
    if (answer.photoUrl !== undefined && answer.photoUrl !== null) {
      if (typeof answer.photoUrl !== 'string') {
        setBinError(bin.id, 'Upload a valid photo for this bin.');
      } else {
        photoUrl = answer.photoUrl.trim() || undefined;
      }
    }

    if (photosDisabled && photoUrl) {
      setBinError(bin.id, 'Photo uploads are disabled in this temporary test.');
    } else if (answer.status === 'needed' && !photosDisabled && !photoUrl) {
      setBinError(bin.id, 'Upload a photo for every bin marked Yes.');
    } else if (answer.status === 'not_needed' && photoUrl) {
      setBinError(bin.id, 'Remove the photo or mark this bin Yes.');
    }

    normalizedAnswers.push({
      bin: bin.number,
      binId: bin.id,
      styleNames,
      status: answer.status,
      ...(photoUrl ? { photoUrl } : {})
    });
  }

  return { answers: normalizedAnswers, fieldErrors };
}
