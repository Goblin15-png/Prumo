<?php

namespace App\Services;

class MercadoPagoWebhookSignature
{
    public function isValid(?string $signatureHeader, ?string $requestId, ?string $dataId, string $secret): bool
    {
        if (! $signatureHeader || $secret === '') {
            return false;
        }

        $parts = [];
        foreach (explode(',', $signatureHeader) as $part) {
            $pair = explode('=', $part, 2);
            if (count($pair) === 2) {
                $parts[strtolower(trim($pair[0]))] = trim($pair[1]);
            }
        }

        $timestamp = $parts['ts'] ?? null;
        $receivedHash = $parts['v1'] ?? null;
        if (! $timestamp || ! ctype_digit($timestamp) || ! $receivedHash || ! ctype_xdigit($receivedHash)) {
            return false;
        }

        $manifestParts = [];
        $dataId = trim((string) $dataId);
        $requestId = trim((string) $requestId);
        if ($dataId !== '') {
            $manifestParts[] = 'id:'.strtolower($dataId);
        }
        if ($requestId !== '') {
            $manifestParts[] = 'request-id:'.$requestId;
        }
        $manifestParts[] = 'ts:'.$timestamp;

        $expectedHash = hash_hmac('sha256', implode(';', $manifestParts).';', $secret);

        return hash_equals($expectedHash, strtolower($receivedHash));
    }
}
