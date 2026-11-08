/**
 * Generates an authentic, high-resolution Bakong KHQR Photo Voucher
 * that can be shared, copied to clipboard, or downloaded as a PNG photo.
 */

export interface KhqrCardData {
  merchantTitle: string;
  merchantAccount: string;
  totalUsd: number;
  totalKhr: number;
  refCode: string;
  qrImageUrl: string;
  itemCount: number;
  currencyMode?: 'USD' | 'KHR';
}

export async function generateKhqrCardBlob(
  data: KhqrCardData
): Promise<{ blob: Blob; dataUrl: string }> {
  const width = 640;
  const height = 860;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Draw outer background with subtle rounded card styling
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Top Red Header (#D91B24 - Authentic Bakong Red)
  const headerHeight = 72;
  ctx.fillStyle = '#D91B24';
  ctx.fillRect(0, 0, width, headerHeight);

  // Red Header Icon "KH" circle
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(38, headerHeight / 2, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#D91B24';
  ctx.font = 'bold 15px "Inter", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KH', 38, headerHeight / 2);

  // "KHQR" text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 24px "Inter", "Arial", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('KHQR', 68, headerHeight / 2);

  // Right Header "BAKONG CAMBODIA"
  ctx.font = 'bold 14px "Inter", "Arial", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('BAKONG CAMBODIA', width - 24, headerHeight / 2);

  // 3. Merchant Name & Details
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 22px "Inter", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.merchantTitle.toUpperCase(), width / 2, 115);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px "Inter", "Arial", sans-serif';
  ctx.fillText(`PHNOM PENH • ${data.merchantAccount}`, width / 2, 140);

  // 4. Amount Box
  const isUsdPrimary = data.currencyMode !== 'KHR';
  const primaryAmount = isUsdPrimary
    ? `$${data.totalUsd.toFixed(2)}`
    : `${data.totalKhr.toLocaleString()} ៛`;
  const secondaryAmount = isUsdPrimary
    ? `(${data.totalKhr.toLocaleString()} ៛)`
    : `($${data.totalUsd.toFixed(2)})`;

  ctx.fillStyle = '#D91B24';
  ctx.font = '900 36px "Inter", "Arial", sans-serif';
  ctx.fillText(primaryAmount, width / 2, 185);

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 15px "Inter", "Arial", sans-serif';
  ctx.fillText(secondaryAmount, width / 2, 215);

  // 5. Draw QR Code Frame
  const qrBoxSize = 380;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = 245;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20);
  ctx.fill();
  ctx.stroke();

  // Load and draw QR Code Image inside box
  const qrImage = new Image();
  qrImage.crossOrigin = 'anonymous';

  await new Promise<void>((resolve) => {
    qrImage.onload = () => {
      try {
        const padding = 20;
        ctx.drawImage(
          qrImage,
          qrBoxX + padding,
          qrBoxY + padding,
          qrBoxSize - padding * 2,
          qrBoxSize - padding * 2
        );
      } catch (err) {
        console.warn('Could not draw QR image directly on canvas:', err);
      }
      resolve();
    };

    qrImage.onerror = () => {
      // Fallback: draw styled QR placeholder with local asset
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.onload = () => {
        try {
          const padding = 20;
          ctx.drawImage(
            fallbackImg,
            qrBoxX + padding,
            qrBoxY + padding,
            qrBoxSize - padding * 2,
            qrBoxSize - padding * 2
          );
        } catch {
          // ignore
        }
        resolve();
      };
      fallbackImg.onerror = () => resolve();
      fallbackImg.src = '/assets/aistudio/image_db99fb1f.png';
    };

    qrImage.src = data.qrImageUrl;
  });

  // 6. Draw Central Bakong Red Emblem (in the center of QR code)
  const centerX = width / 2;
  const centerY = qrBoxY + qrBoxSize / 2;
  const emblemRadius = 26;

  // White circular backing
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, emblemRadius + 3, 0, Math.PI * 2);
  ctx.fill();

  // Red circle
  ctx.fillStyle = '#D91B24';
  ctx.beginPath();
  ctx.arc(centerX, centerY, emblemRadius, 0, Math.PI * 2);
  ctx.fill();

  // White inner concentric circle
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
  ctx.stroke();

  // White center dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // 8 Flower petals around center
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const px = centerX + Math.cos(angle) * 11;
    const py = centerY + Math.sin(angle) * 11;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Footer Instructions
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 13px "Inter", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Scan with Bakong, ABA Mobile, Wing, Acleda & any bank app',
    width / 2,
    655
  );

  // 8. Bottom Information Bar (Ref Code, Items, Expiry)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 685, width, height - 685);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 685);
  ctx.lineTo(width, 685);
  ctx.stroke();

  // Ref Code
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px "Inter", "Arial", sans-serif';
  ctx.fillText(`BILL REF: ${data.refCode}`, width / 2, 715);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 13px "Inter", "Arial", sans-serif';
  ctx.fillText(
    `Order Total: $${data.totalUsd.toFixed(2)} (${data.totalKhr.toLocaleString()} ៛) • ${data.itemCount} Item(s)`,
    width / 2,
    745
  );

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 11px "Inter", "Arial", sans-serif';
  ctx.fillText(
    'Kani Game Official POS Billing System • Valid for 10 Minutes',
    width / 2,
    775
  );

  // Return PNG Blob & Data URL
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create Blob from canvas'));
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      resolve({ blob, dataUrl });
    }, 'image/png');
  });
}
