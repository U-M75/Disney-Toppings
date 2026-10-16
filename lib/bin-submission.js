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

    let rawStyles;
    if (answer.styles !== undefined) {
      rawStyles = answer.styles;
    } else if (answer.styleNames !== undefined) {
      if (!Array.isArray(answer.styleNames)) {
        setBinError(bin.id, 'Enter topping/style names as a list.');
        rawStyles = [];
      } else {
        rawStyles = answer.styleNames.map((name, index) => ({
          name,
          bagsRemaining: Array.isArray(answer.bagsRemaining) ? answer.bagsRemaining[index] : undefined
        }));
      }
    } else {
      rawStyles = [];
    }

    const styles = [];
    if (!Array.isArray(rawStyles)) {
      setBinError(bin.id, 'Enter topping/style entries as a list.');
    } else {
      if (rawStyles.length > MAX_STYLES_PER_BIN) {
        setBinError(bin.id, `Use no more than ${MAX_STYLES_PER_BIN} styles for one bin.`);
      }
      for (const rawStyle of rawStyles.slice(0, MAX_STYLES_PER_BIN)) {
        if (!rawStyle || typeof rawStyle !== 'object' || Array.isArray(rawStyle)) {
          setBinError(bin.id, 'Each style needs a name and a bag count.');
          continue;
        }
        if (rawStyle.name !== undefined && typeof rawStyle.name !== 'string') {
          setBinError(bin.id, 'Each topping/style name must be text.');
          continue;
        }
        const name = (typeof rawStyle.name === 'string' ? rawStyle.name : '').trim().replace(/\s+/g, ' ');
        const hasBagCount = rawStyle.bagsRemaining !== undefined
          && rawStyle.bagsRemaining !== null
          && rawStyle.bagsRemaining !== '';
        if (!name && !hasBagCount) continue;
        if (!name) {
          setBinError(bin.id, 'Enter a topping/style name for every bag count.');
          continue;
        }
        if (name.length > MAX_STYLE_NAME_LENGTH) {
          setBinError(bin.id, `Each topping/style name must be ${MAX_STYLE_NAME_LENGTH} characters or fewer.`);
          continue;
        }
        if (!hasBagCount) {
          setBinError(bin.id, 'Enter the number of bags remaining for each style.');
          continue;
        }
        const bagsRemaining = rawStyle.bagsRemaining;
        if (typeof bagsRemaining !== 'number' || !Number.isSafeInteger(bagsRemaining) || bagsRemaining < 0) {
          setBinError(bin.id, 'Bag counts must be whole numbers greater than or equal to 0.');
          continue;
        }
        styles.push({ name, bagsRemaining });
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
      styles,
      status: answer.status,
      ...(photoUrl ? { photoUrl } : {})
    });
  }

  return { answers: normalizedAnswers, fieldErrors };
}
