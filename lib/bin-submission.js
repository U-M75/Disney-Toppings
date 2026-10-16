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
      fieldErrors[bin.id] = 'This bin was included more than once. Refresh the form and try again.';
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
      fieldErrors[bin.id] = 'Tap Yes or No for this bin.';
      continue;
    }
    if (!['needed', 'not_needed'].includes(answer.status)) {
      fieldErrors[bin.id] = 'Tap Yes or No for this bin.';
      continue;
    }

    let photoUrl;
    if (answer.photoUrl !== undefined && answer.photoUrl !== null) {
      if (typeof answer.photoUrl !== 'string') {
        fieldErrors[bin.id] = 'Upload a valid photo for this bin.';
      } else {
        photoUrl = answer.photoUrl.trim() || undefined;
      }
    }

    if (photosDisabled && photoUrl) {
      fieldErrors[bin.id] = 'Photo uploads are disabled in this temporary test.';
    } else if (answer.status === 'needed' && !photosDisabled && !photoUrl) {
      fieldErrors[bin.id] = 'Upload a photo for every bin marked Yes.';
    } else if (answer.status === 'not_needed' && photoUrl) {
      fieldErrors[bin.id] = 'Remove the photo or mark this bin Yes.';
    }

    normalizedAnswers.push({
      bin: bin.number,
      binId: bin.id,
      status: answer.status,
      ...(photoUrl ? { photoUrl } : {})
    });
  }

  return { answers: normalizedAnswers, fieldErrors };
}
