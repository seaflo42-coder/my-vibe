import { useState, useEffect, useCallback } from 'react';

// Seoul district data with coordinates for map-based API
const SEOUL_DISTRICTS = [
  { name: '강남구', code: '1168000000', lat: 37.5172, lon: 127.0473 },
  { name: '서초구', code: '1165000000', lat: 37.4837, lon: 127.0324 },
  { name: '송파구', code: '1171000000', lat: 37.5145, lon: 127.1059 },
  { name: '강동구', code: '1174000000', lat: 37.5301, lon: 127.1238 },
  { name: '마포구', code: '1144000000', lat: 37.5663, lon: 126.9014 },
  { name: '용산구', code: '1117000000', lat: 37.5326, lon: 126.9909 },
  { name: '성동구', code: '1120000000', lat: 37.5634, lon: 127.0370 },
  { name: '광진구', code: '1121500000', lat: 37.5385, lon: 127.0824 },
  { name: '영등포구', code: '1156000000', lat: 37.5264, lon: 126.8963 },
  { name: '동작구', code: '1159000000', lat: 37.5124, lon: 126.9394 },
  { name: '관악구', code: '1162000000', lat: 37.4784, lon: 126.9516 },
  { name: '양천구', code: '1147000000', lat: 37.5170, lon: 126.8665 },
  { name: '강서구', code: '1150000000', lat: 37.5510, lon: 126.8496 },
  { name: '구로구', code: '1153000000', lat: 37.4954, lon: 126.8878 },
  { name: '금천구', code: '1154500000', lat: 37.4569, lon: 126.8955 },
  { name: '종로구', code: '1111000000', lat: 37.5735, lon: 126.9790 },
  { name: '중구', code: '1114000000', lat: 37.5641, lon: 126.9979 },
  { name: '동대문구', code: '1123000000', lat: 37.5744, lon: 127.0396 },
  { name: '중랑구', code: '1126000000', lat: 37.6065, lon: 127.0927 },
  { name: '성북구', code: '1129000000', lat: 37.5894, lon: 127.0167 },
  { name: '강북구', code: '1130500000', lat: 37.6397, lon: 127.0255 },
  { name: '도봉구', code: '1132000000', lat: 37.6688, lon: 127.0472 },
  { name: '노원구', code: '1135000000', lat: 37.6542, lon: 127.0568 },
  { name: '은평구', code: '1138000000', lat: 37.6027, lon: 126.9292 },
  { name: '서대문구', code: '1141000000', lat: 37.5791, lon: 126.9368 },
];

const PROPERTY_TYPES = [
  { code: 'APT', label: '아파트' },
  { code: 'OPST', label: '오피스텔' },
  { code: 'VL', label: '빌라/연립' },
  { code: 'DDDGG', label: '단독/다가구' },
  { code: 'JT', label: '주택' },
  { code: 'OR', label: '원룸' },
];

const TRADE_TYPES = [
  { code: 'A1', label: '매매' },
  { code: 'B1', label: '전세' },
  { code: 'B2', label: '월세' },
];

const PRICE_RANGES = [
  { label: '전체', min: 0, max: 9000000 },
  { label: '~3억', min: 0, max: 30000 },
  { label: '3~6억', min: 30000, max: 60000 },
  { label: '6~9억', min: 60000, max: 90000 },
  { label: '9~12억', min: 90000, max: 120000 },
  { label: '12~15억', min: 120000, max: 150000 },
  { label: '15~20억', min: 150000, max: 200000 },
  { label: '20억~', min: 200000, max: 9000000 },
];

const AREA_RANGES = [
  { label: '전체', min: 0, max: 900000 },
  { label: '10평 이하', min: 0, max: 33 },
  { label: '10~20평', min: 33, max: 66 },
  { label: '20~30평', min: 66, max: 99 },
  { label: '30~40평', min: 99, max: 132 },
  { label: '40~50평', min: 132, max: 165 },
  { label: '50평 이상', min: 165, max: 900000 },
];

function formatPrice(price) {
  if (!price && price !== 0) return '-';
  const num = typeof price === 'string' ? parseInt(price.replace(/,/g, ''), 10) : price;
  if (isNaN(num)) return price;
  if (num >= 10000) {
    const eok = Math.floor(num / 10000);
    const remainder = num % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만` : `${eok}억`;
  }
  return `${num.toLocaleString()}만`;
}

function Summary({ articles, tradeType }) {
  if (!articles || articles.length === 0) return null;

  const prices = articles
    .map(a => {
      if (typeof a.prc === 'number') return a.prc;
      const p = String(a.prc || a.dealOrWarrantPrc || '');
      return parseInt(p.replace(/[^0-9]/g, ''), 10);
    })
    .filter(p => !isNaN(p) && p > 0);

  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const tradeLabel = tradeType === 'A1' ? '매매가' : tradeType === 'B1' ? '전세가' : '보증금';

  return (
    <div style={styles.summaryCard}>
      <h3 style={styles.summaryTitle}>가격 요약</h3>
      <div style={styles.summaryGrid}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>매물 수</span>
          <span style={styles.summaryValue}>{articles.length}건</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>최저 {tradeLabel}</span>
          <span style={{ ...styles.summaryValue, color: '#22c55e' }}>{formatPrice(min)}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>최고 {tradeLabel}</span>
          <span style={{ ...styles.summaryValue, color: '#ef4444' }}>{formatPrice(max)}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>평균 {tradeLabel}</span>
          <span style={{ ...styles.summaryValue, color: '#6366f1' }}>{formatPrice(avg)}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>중간값</span>
          <span style={{ ...styles.summaryValue, color: '#f59e0b' }}>{formatPrice(median)}</span>
        </div>
      </div>
    </div>
  );
}

function PriceDistribution({ articles }) {
  if (!articles || articles.length === 0) return null;

  const prices = articles
    .map(a => {
      if (typeof a.prc === 'number') return a.prc;
      const p = String(a.prc || a.dealOrWarrantPrc || '');
      return parseInt(p.replace(/[^0-9]/g, ''), 10);
    })
    .filter(p => !isNaN(p) && p > 0);

  if (prices.length === 0) return null;

  const buckets = [
    { label: '~3억', min: 0, max: 30000, count: 0 },
    { label: '3~6억', min: 30000, max: 60000, count: 0 },
    { label: '6~9억', min: 60000, max: 90000, count: 0 },
    { label: '9~12억', min: 90000, max: 120000, count: 0 },
    { label: '12~15억', min: 120000, max: 150000, count: 0 },
    { label: '15~20억', min: 150000, max: 200000, count: 0 },
    { label: '20억~', min: 200000, max: Infinity, count: 0 },
  ];

  prices.forEach(p => {
    for (const b of buckets) {
      if (p >= b.min && p < b.max) { b.count++; break; }
    }
  });

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div style={styles.summaryCard}>
      <h3 style={styles.summaryTitle}>가격대 분포</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {buckets.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '70px', fontSize: '13px', color: '#b0bec5', textAlign: 'right' }}>{b.label}</span>
            <div style={{ flex: 1, background: '#1e293b', borderRadius: '4px', height: '24px', position: 'relative' }}>
              <div style={{
                width: `${(b.count / maxCount) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                borderRadius: '4px',
                minWidth: b.count > 0 ? '4px' : '0',
                transition: 'width 0.3s ease',
              }} />
              {b.count > 0 && (
                <span style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '12px', color: '#e2e8f0', fontWeight: 600,
                }}>{b.count}건</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArticleCard({ article, tradeType, onSelect }) {
  const priceDisplay = article.hanPrc || formatPrice(article.prc) || '-';
  const rentDisplay = article.rentPrc ? formatPrice(article.rentPrc) : '';
  const area = article.spc2 || article.spc1 || '-';
  const areaInPyeong = area !== '-' ? (parseFloat(area) / 3.3058).toFixed(1) : '-';
  const floor = article.flrInfo || '-';
  const name = article.atclNm || '-';
  const direction = article.direction || '';
  const desc = article.atclFetrDesc || '';
  const confirmDate = article.atclCfmYmd || '';
  const tags = article.tagList || [];
  const tradeName = article.tradTpNm || '';
  const sameCount = article.sameAddrCnt || 0;
  const imgUrl = article.repImgUrl ? `/api/naver/image?path=${encodeURIComponent(article.repImgUrl)}` : null;

  return (
    <div
      style={styles.articleCard}
      onClick={() => onSelect(article)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {imgUrl && (
        <div style={styles.articleImgWrap}>
          <img
            src={imgUrl}
            alt={name}
            style={styles.articleImg}
            loading="lazy"
            onError={e => { e.target.parentElement.style.display = 'none'; }}
          />
        </div>
      )}
      <div style={styles.articleBody}>
      <div style={styles.articleHeader}>
        <span style={styles.articleName}>{name}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {tradeName && <span style={{ fontSize: '11px', color: '#a5b4fc', background: '#1e1b4b', padding: '2px 8px', borderRadius: '4px' }}>{tradeName}</span>}
          <span style={styles.articleFloor}>{floor}</span>
        </div>
      </div>
      <div style={styles.articlePrice}>
        {tradeType === 'B2' ? `${priceDisplay} / ${rentDisplay}` : priceDisplay}
      </div>
      <div style={styles.articleDetails}>
        <span>{area}m² ({areaInPyeong}평)</span>
        {direction && <span>{direction}</span>}
        {confirmDate && <span>확인 {confirmDate}</span>}
        {sameCount > 1 && <span style={{ color: '#f59e0b' }}>동일주소 {sameCount}건</span>}
      </div>
      {desc && (
        <div style={{ fontSize: '12px', color: '#8899a6', marginTop: '6px', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {desc}
        </div>
      )}
      {tags.length > 0 && (
        <div style={styles.articleTags}>
          {tags.slice(0, 4).map((tag, i) => (
            <span key={i} style={styles.tag}>{tag}</span>
          ))}
        </div>
      )}
      <div style={styles.articleLinkHint}>
        상세 보기 →
      </div>
      </div>
    </div>
  );
}

function DetailModal({ article, tradeType, onClose }) {
  const [detail, setDetail] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    if (!article?.atclNo) return;
    setLoadingDetail(true);
    Promise.all([
      fetch(`/api/naver/article/${article.atclNo}`).then(r => r.json()).catch(() => null),
      fetch(`/api/naver/article/${article.atclNo}/photos`).then(r => r.json()).catch(() => null),
    ]).then(([detailData, photosData]) => {
      setDetail(detailData);
      const photoList = Array.isArray(photosData) ? photosData
        : (photosData?.photos || photosData?.articlePhotos || []);
      setPhotos(photoList);
      setPhotoIdx(0);
      setLoadingDetail(false);
    });
  }, [article?.atclNo]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!article) return null;

  const priceDisplay = article.hanPrc || formatPrice(article.prc) || '-';
  const rentDisplay = article.rentPrc ? formatPrice(article.rentPrc) : '';
  const area = article.spc2 || article.spc1 || '-';
  const areaInPyeong = area !== '-' ? (parseFloat(area) / 3.3058).toFixed(1) : '-';
  const floor = article.flrInfo || '-';
  const name = article.atclNm || '-';
  const direction = article.direction || '';
  const desc = article.atclFetrDesc || '';
  const confirmDate = article.atclCfmYmd || '';
  const tags = article.tagList || [];
  const tradeName = article.tradTpNm || '';
  const sameCount = article.sameAddrCnt || 0;
  const detailUrl = `https://new.land.naver.com/articles/${article.atclNo}`;

  // Build image list: photos from API + fallback to repImgUrl
  const imgList = photos.length > 0
    ? photos.map(p => `/api/naver/image?path=${encodeURIComponent(p.imageSrc || p.imgUrl || p)}`)
    : (article.repImgUrl ? [`/api/naver/image?path=${encodeURIComponent(article.repImgUrl)}`] : []);

  // Extract extra detail fields
  const d = detail?.articleDetail || detail?.article || detail || {};
  const agentName = d.rltrNm || d.agentName || '';
  const agentTel = d.rltrTelNo || d.agentTel || '';
  const moveInDate = d.mvInDate || d.moveInDate || '';
  const maintenanceCost = d.maintenanceCost || d.wrtnMntcCost || '';
  const maintenanceItems = d.maintenanceItems || d.wrtnMntcItmDscr || '';
  const roomCount = d.roomCnt || d.roomCount || '';
  const bathroomCount = d.bathroomCnt || d.bathroomCount || '';
  const approvalDate = d.approvalDate || d.useAprDt || '';
  const totalHousehold = d.totalHouseholdCount || d.hhldCnt || '';
  const parkingCount = d.parkingCount || d.parkngCnt || '';
  const buildingName = d.buildingName || d.bldNm || article.atclNm || '';
  const fullAddress = d.address || d.exposeAddress || '';
  const articleDesc = d.articleDescription || d.atclFetrDesc || desc;

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.container} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>{name}</h2>
          <button style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={modalStyles.content}>
          {/* Image gallery */}
          {imgList.length > 0 && (
            <div style={modalStyles.gallery}>
              <img
                src={imgList[photoIdx]}
                alt={name}
                style={modalStyles.mainImg}
                onError={e => { e.target.style.display = 'none'; }}
              />
              {imgList.length > 1 && (
                <div style={modalStyles.galleryNav}>
                  <button
                    style={modalStyles.navBtn}
                    onClick={() => setPhotoIdx(i => (i - 1 + imgList.length) % imgList.length)}
                  >◀</button>
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>{photoIdx + 1} / {imgList.length}</span>
                  <button
                    style={modalStyles.navBtn}
                    onClick={() => setPhotoIdx(i => (i + 1) % imgList.length)}
                  >▶</button>
                </div>
              )}
            </div>
          )}

          {/* Price section */}
          <div style={modalStyles.section}>
            <div style={modalStyles.priceRow}>
              {tradeName && <span style={modalStyles.tradeBadge}>{tradeName}</span>}
              <span style={modalStyles.price}>
                {tradeType === 'B2' ? `${priceDisplay} / ${rentDisplay}` : priceDisplay}
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div style={modalStyles.section}>
            <h3 style={modalStyles.sectionTitle}>매물 정보</h3>
            <div style={modalStyles.infoGrid}>
              <InfoRow label="면적" value={`${area}m² (${areaInPyeong}평)`} />
              <InfoRow label="층" value={floor} />
              {direction && <InfoRow label="향" value={direction} />}
              {roomCount && <InfoRow label="방/욕실" value={`${roomCount}/${bathroomCount || '-'}`} />}
              {confirmDate && <InfoRow label="매물확인일" value={confirmDate} />}
              {moveInDate && <InfoRow label="입주가능일" value={moveInDate} />}
              {approvalDate && <InfoRow label="사용승인일" value={approvalDate} />}
              {totalHousehold && <InfoRow label="총세대수" value={`${totalHousehold}세대`} />}
              {parkingCount && <InfoRow label="주차" value={`${parkingCount}대`} />}
              {maintenanceCost && <InfoRow label="관리비" value={`${maintenanceCost}만원`} />}
              {maintenanceItems && <InfoRow label="관리비 포함" value={maintenanceItems} />}
              {sameCount > 1 && <InfoRow label="동일주소 매물" value={`${sameCount}건`} highlight />}
            </div>
          </div>

          {/* Address */}
          {fullAddress && (
            <div style={modalStyles.section}>
              <h3 style={modalStyles.sectionTitle}>위치</h3>
              <p style={{ color: '#cbd5e1', fontSize: '14px', margin: 0 }}>{fullAddress}</p>
            </div>
          )}

          {/* Description */}
          {articleDesc && (
            <div style={modalStyles.section}>
              <h3 style={modalStyles.sectionTitle}>매물 설명</h3>
              <p style={{ color: '#cbd5e1', fontSize: '14px', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{articleDesc}</p>
            </div>
          )}

          {/* Agent info */}
          {agentName && (
            <div style={modalStyles.section}>
              <h3 style={modalStyles.sectionTitle}>중개사 정보</h3>
              <div style={modalStyles.infoGrid}>
                <InfoRow label="중개사" value={agentName} />
                {agentTel && <InfoRow label="연락처" value={agentTel} />}
              </div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div style={{ ...modalStyles.section, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tags.map((tag, i) => (
                <span key={i} style={styles.tag}>{tag}</span>
              ))}
            </div>
          )}

          {loadingDetail && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '14px' }}>
              상세 정보 불러오는 중...
            </div>
          )}

          {/* Naver link */}
          <a
            href={detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={modalStyles.naverLink}
          >
            네이버 부동산에서 보기 →
          </a>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <div style={modalStyles.infoRow}>
      <span style={modalStyles.infoLabel}>{label}</span>
      <span style={{ ...modalStyles.infoValue, ...(highlight ? { color: '#f59e0b' } : {}) }}>{value}</span>
    </div>
  );
}

export default function RealEstatePage() {
  const [district, setDistrict] = useState(SEOUL_DISTRICTS[0]);
  const [propertyType, setPropertyType] = useState('APT');
  const [tradeType, setTradeType] = useState('A1');
  const [priceRange, setPriceRange] = useState(PRICE_RANGES[0]);
  const [areaRange, setAreaRange] = useState(AREA_RANGES[0]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState('0');
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState('prc'); // prc, spc, date
  const [selectedArticle, setSelectedArticle] = useState(null);

  const fetchArticles = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);

    try {
      const d = district;
      // Mobile API requires map bounds around the district center
      const spread = 0.025;
      const params = new URLSearchParams({
        rletTpCd: propertyType,
        tradTpCd: tradeType,
        z: '14',
        lat: String(d.lat),
        lon: String(d.lon),
        btm: String(d.lat - spread),
        lft: String(d.lon - spread),
        top: String(d.lat + spread),
        rgt: String(d.lon + spread),
        cortarNo: d.code,
        page: String(pageNum),
        spcMin: String(areaRange.min),
        spcMax: String(areaRange.max),
        dprcMin: String(priceRange.min),
        dprcMax: String(priceRange.max),
      });

      const resp = await fetch(`/api/naver/articles?${params}`);
      const data = await resp.json();

      if (data.error) {
        setError(data.error);
        setArticles([]);
        return;
      }

      const list = data.body || [];
      setArticles(prev => {
        const updated = pageNum === 1 ? list : [...prev, ...list];
        setTotalCount(String(updated.length));
        return updated;
      });
      setHasMore(!!data.more);
      setPage(pageNum);
    } catch (e) {
      setError('데이터를 불러오는데 실패했습니다: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [district, propertyType, tradeType, priceRange, areaRange]);

  useEffect(() => {
    fetchArticles(1);
  }, [fetchArticles]);

  return (
    <div data-view="realestate" style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>서울 부동산 시세</h1>
        <p style={styles.subtitle}>네이버 부동산 기반 실시간 매물 조회</p>
      </header>

      {/* Filters */}
      <div style={styles.filtersContainer}>
        {/* District */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>지역 (구)</label>
          <select
            style={styles.select}
            value={district.code}
            onChange={e => {
              const d = SEOUL_DISTRICTS.find(d => d.code === e.target.value);
              if (d) setDistrict(d);
            }}
          >
            {SEOUL_DISTRICTS.map(d => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Property Type */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>매물 유형</label>
          <div style={styles.chipGroup}>
            {PROPERTY_TYPES.map(t => (
              <button
                key={t.code}
                style={{
                  ...styles.chip,
                  ...(propertyType === t.code ? styles.chipActive : {}),
                }}
                onClick={() => setPropertyType(t.code)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trade Type */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>거래 유형</label>
          <div style={styles.chipGroup}>
            {TRADE_TYPES.map(t => (
              <button
                key={t.code}
                style={{
                  ...styles.chip,
                  ...(tradeType === t.code ? styles.chipActive : {}),
                }}
                onClick={() => setTradeType(t.code)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price Range */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>가격대</label>
          <div style={styles.chipGroup}>
            {PRICE_RANGES.map(r => (
              <button
                key={r.label}
                style={{
                  ...styles.chip,
                  ...(priceRange.label === r.label ? styles.chipActive : {}),
                }}
                onClick={() => setPriceRange(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area Range */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>면적</label>
          <div style={styles.chipGroup}>
            {AREA_RANGES.map(r => (
              <button
                key={r.label}
                style={{
                  ...styles.chip,
                  ...(areaRange.label === r.label ? styles.chipActive : {}),
                }}
                onClick={() => setAreaRange(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>정렬</label>
          <select style={styles.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="prc">가격순</option>
            <option value="spc">면적순</option>
            <option value="date">최신순</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Summary */}
      <Summary articles={articles} tradeType={tradeType} />
      <PriceDistribution articles={articles} />

      {/* Results */}
      <div style={styles.resultsHeader}>
        <span style={styles.resultsCount}>
          {loading ? '검색 중...' : `총 ${totalCount}${hasMore ? '+' : ''}건의 매물`}
        </span>
      </div>

      <div style={styles.articleGrid}>
        {articles.map((article, i) => (
          <ArticleCard key={article.atclNo || i} article={article} tradeType={tradeType} onSelect={setSelectedArticle} />
        ))}
      </div>

      {loading && (
        <div style={styles.loadingSpinner}>
          <div style={styles.spinner} />
          <span>매물 정보를 불러오는 중...</span>
        </div>
      )}

      {!loading && articles.length > 0 && hasMore && (
        <button style={styles.loadMoreBtn} onClick={() => fetchArticles(page + 1)}>
          더 보기 (현재 {articles.length}건)
        </button>
      )}

      {!loading && articles.length === 0 && !error && (
        <div style={styles.emptyState}>
          <span style={{ fontSize: '48px' }}>🏠</span>
          <p>조건에 맞는 매물이 없습니다.</p>
          <p style={{ fontSize: '14px', color: '#8899a6' }}>필터 조건을 변경해 보세요.</p>
        </div>
      )}

      {selectedArticle && (
        <DetailModal
          article={selectedArticle}
          tradeType={tradeType}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#f1f5f9',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    margin: 0,
    background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    color: '#b0bec5',
    fontSize: '14px',
    marginTop: '8px',
  },
  filtersContainer: {
    background: '#111827',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#1e293b',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  select: {
    background: '#1e293b',
    color: '#f1f5f9',
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#334155',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '300px',
  },
  chipGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  chip: {
    background: '#1e293b',
    color: '#cbd5e1',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#334155',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
  },
  chipActive: {
    background: '#6366f1',
    color: '#fff',
    borderColor: '#6366f1',
  },
  summaryCard: {
    background: '#111827',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#1e293b',
  },
  summaryTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: '0 0 16px 0',
    color: '#e2e8f0',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '16px',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: '#0f172a',
    padding: '14px',
    borderRadius: '12px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  resultsCount: {
    fontSize: '14px',
    color: '#cbd5e1',
    fontWeight: 600,
  },
  articleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '12px',
  },
  articleCard: {
    background: '#111827',
    borderRadius: '12px',
    overflow: 'hidden',
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#1e293b',
    transition: 'border-color 0.2s, transform 0.2s',
    cursor: 'pointer',
  },
  articleImgWrap: {
    width: '100%',
    height: '160px',
    overflow: 'hidden',
    background: '#0f172a',
  },
  articleImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  articleBody: {
    padding: '14px 16px 16px',
  },
  articleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  articleName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '80%',
  },
  articleFloor: {
    fontSize: '13px',
    color: '#94a3b8',
    flexShrink: 0,
  },
  articlePrice: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#a5b4fc',
    marginBottom: '8px',
  },
  articleDetails: {
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#b0bec5',
    flexWrap: 'wrap',
  },
  articleTags: {
    display: 'flex',
    gap: '6px',
    marginTop: '10px',
    flexWrap: 'wrap',
  },
  tag: {
    background: '#1e293b',
    color: '#a5b4fc',
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  articleLinkHint: {
    fontSize: '12px',
    color: '#6366f1',
    marginTop: '10px',
    fontWeight: 500,
  },
  loadMoreBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    marginTop: '20px',
    background: '#1e293b',
    color: '#818cf8',
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#334155',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.2s',
  },
  loadingSpinner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '40px',
    color: '#94a3b8',
    fontSize: '14px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderWidth: '3px',
    borderStyle: 'solid',
    borderColor: '#1e293b',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#94a3b8',
    fontSize: '16px',
  },
  errorBanner: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '12px 16px',
    borderRadius: '10px',
    marginBottom: '16px',
    fontSize: '14px',
  },
};

const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  container: {
    background: '#111827',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '640px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#f1f5f9',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    flexShrink: 0,
  },
  content: {
    overflowY: 'auto',
    padding: '0 20px 20px',
  },
  gallery: {
    margin: '0 -20px',
    background: '#0f172a',
  },
  mainImg: {
    width: '100%',
    height: '300px',
    objectFit: 'cover',
    display: 'block',
  },
  galleryNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '10px',
  },
  navBtn: {
    background: '#1e293b',
    border: 'none',
    color: '#e2e8f0',
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: '8px',
    padding: '6px 14px',
  },
  section: {
    padding: '16px 0',
    borderBottom: '1px solid #1e293b',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
    margin: '0 0 12px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  tradeBadge: {
    fontSize: '12px',
    color: '#a5b4fc',
    background: '#1e1b4b',
    padding: '4px 10px',
    borderRadius: '6px',
    fontWeight: 600,
  },
  price: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#a5b4fc',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#0f172a',
    borderRadius: '8px',
  },
  infoLabel: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: '13px',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  naverLink: {
    display: 'block',
    textAlign: 'center',
    marginTop: '20px',
    padding: '14px',
    background: '#1e293b',
    color: '#818cf8',
    borderRadius: '12px',
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
    transition: 'background 0.2s',
  },
};
