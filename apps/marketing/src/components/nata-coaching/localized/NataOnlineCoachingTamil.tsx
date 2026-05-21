import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';

/**
 * Native Tamil landing page for NATA online coaching.
 * Serves /ta/nata-online-coaching with mostly-Tamil content
 * (Tamil headings, intro, FAQ, CTAs) so Google indexes it
 * as a true Tamil page instead of "Duplicate, alternate version".
 *
 * Locale-specific hreflang and inLanguage on schema are set
 * by the parent page.tsx via setRequestLocale + buildAlternates.
 */
export default function NataOnlineCoachingTamil() {
  const pageUrl = `${BASE_URL}/ta/nata-online-coaching`;

  const faqs = [
    {
      question: 'NATA ஆன்லைன் கோச்சிங் என்றால் என்ன?',
      answer:
        'NATA (National Aptitude Test in Architecture) ஆன்லைன் கோச்சிங் என்பது அனுபவம் வாய்ந்த கட்டிடக்கலை ஆசிரியர்களால் வீடியோ மூலம் நேரடியாக நடத்தப்படும் கட்டமைக்கப்பட்ட பயிற்சி வகுப்பு. நேராம் கிளாஸஸ் (Neram Classes) NIT, IIT, SPA முன்னாள் மாணவர்களைக் கொண்ட ஆசிரியர்களுடன், ஒரு பேட்சில் அதிகபட்சம் 25 மாணவர்கள், தினசரி வரைபடப் பயிற்சி, மற்றும் 99.9% வெற்றி விகிதத்துடன் 2009 முதல் இந்தச் சேவையை வழங்குகிறது.',
    },
    {
      question: 'NATA ஆன்லைன் கோச்சிங்கின் கட்டணம் என்ன?',
      answer:
        'நேராம் கிளாஸஸில் NATA ஆன்லைன் கோச்சிங் கட்டணம் 3 மாத கிராஷ் கோர்ஸுக்கு ரூ. 15,000 முதல், 1 வருட திட்டத்திற்கு ரூ. 25,000, மற்றும் 2 வருட திட்டத்திற்கு ரூ. 30,000 வரை. EMI வாய்ப்புகள் மற்றும் தேவை அடிப்படையிலான உதவித்தொகை தமிழ்நாட்டு மாணவர்களுக்குக் கிடைக்கிறது.',
    },
    {
      question: 'தமிழ்நாட்டில் இருந்து NATA ஆன்லைன் கோச்சிங் சேர முடியுமா?',
      answer:
        'ஆம். சென்னை, கோயம்புத்தூர், மதுரை, திருச்சி, சேலம், வேலூர், திருப்பூர், புதுக்கோட்டை, காஞ்சிபுரம் உள்ளிட்ட தமிழ்நாட்டின் அனைத்து மாவட்டங்களிலும் உள்ள மாணவர்கள் நேராம் கிளாஸஸ் ஆன்லைன் வகுப்புகளில் சேரலாம். நிலையான இணைய இணைப்பும் ஒரு லேப்டாப் அல்லது டேப்லெட்டும் மட்டுமே தேவை.',
    },
    {
      question: 'NATA தேர்வு முறை 2026 எப்படி இருக்கும்?',
      answer:
        'NATA 2026 ஆன்லைனில் நடத்தப்படும். மொத்தம் 200 மதிப்பெண்களுக்கு 125 கேள்விகள் 3 மணி நேரத்தில். மூன்று பிரிவுகள்: Diagrammatic Reasoning, Numerical & Verbal Reasoning, Inductive & Situational Reasoning (வரைபடம் உட்பட). எதிர்மறை மதிப்பெண்கள் இல்லை.',
    },
    {
      question: 'நேராம் கிளாஸஸ் தமிழில் கற்பிக்கப்படுமா?',
      answer:
        'ஆம். நேராம் கிளாஸஸ் ஆங்கிலம், தமிழ், இந்தி, கன்னடம், மலையாளம் என 5 மொழிகளில் NATA பயிற்சியை வழங்கும் ஒரே நிறுவனமாகும். தமிழ் மீடியம் மாணவர்கள் சேருவதற்கான நேரத்தில் தங்கள் மொழியைத் தேர்வு செய்யலாம்.',
    },
    {
      question: 'நேரடி வகுப்பா அல்லது முன்பதிவு செய்த வீடியோவா?',
      answer:
        'நேராம் கிளாஸஸ் முழுவதும் நேரடி (live) வகுப்புகளை நடத்துகிறது. நீங்கள் கேள்விகள் கேட்கலாம், உடனடி பின்னூட்டம் பெறலாம், மற்றும் வரைபடங்களை நேரடியாக ஆசிரியருக்கு காட்டலாம். அனைத்து வகுப்புகளும் பதிவு செய்யப்பட்டு மறுபார்வைக்காக கிடைக்கின்றன.',
    },
    {
      question: 'என்னுடைய மாவட்டத்தில் இருந்து என்னென்ன கட்டிடக்கலை கல்லூரிகளை இலக்கு வைக்கலாம்?',
      answer:
        'தமிழ்நாட்டில் சென்னையின் அண்ணா பல்கலைக்கழக கட்டிடக்கலைப் பள்ளி (SAP), MEASI, BSA Crescent, SRM, Sathyabama, மற்றும் தேசிய அளவில் NIT திருச்சி (B.Arch), SPA Delhi, CEPT Ahmedabad ஆகியவை முக்கிய இலக்குகள். உங்கள் மதிப்பெண்ணுக்கு ஏற்ற கல்லூரிகளை எங்கள் இலவச கல்லூரி ப்ரெடிக்டர் கருவியில் பார்க்கலாம்.',
    },
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={{
          ...generateCourseSchema({
            name: 'NATA ஆன்லைன் கோச்சிங் 2026: நேரடி வகுப்புகள், NIT/IIT ஆசிரியர்கள்',
            description:
              'இந்தியாவின் மிகவும் நம்பகமான NATA ஆன்லைன் கோச்சிங். NIT, IIT, SPA முன்னாள் மாணவர்களைக் கொண்ட ஆசிரியர்கள், தினசரி வரைபடப் பயிற்சி, 100+ மாதிரி தேர்வுகள், 99.9% வெற்றி விகிதம், 2009 முதல்.',
            url: pageUrl,
            modes: ['online'],
            price: 15000,
          }),
          inLanguage: 'ta',
        }}
      />
      <JsonLd data={{ ...generateFAQSchema(faqs), inLanguage: 'ta' }} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'முகப்பு', url: `${BASE_URL}/ta` },
          { name: 'NATA ஆன்லைன் கோச்சிங்' },
        ])}
      />

      <Box lang="ta">
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Chip
              label="NATA 2026: நேரடி ஆன்லைன் கோச்சிங்"
              sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
            />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.3 }}
            >
              NATA ஆன்லைன் கோச்சிங் 2026
            </Typography>
            <Typography variant="h5" sx={{ mb: 4, opacity: 0.92, lineHeight: 1.7, maxWidth: 820 }}>
              கட்டிடக்கலை மாணவர்களுக்கான நேரடி வகுப்புகள். NIT, IIT, SPA முன்னாள் மாணவர்களாகிய ஆசிரியர்கள்.
              99.9% வெற்றி விகிதம், ஒரு பேட்சில் அதிகபட்சம் 25 மாணவர்கள், தினசரி வரைபடப் பயிற்சி.
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/ta/demo-class"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                இலவச டெமோ வகுப்பு
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/ta/apply"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                இப்போதே சேருங்கள்
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* AEO answer block in Tamil */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              NATA ஆன்லைன் கோச்சிங் என்றால் என்ன?
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.9, color: 'text.secondary', fontSize: '1.05rem', mb: 3 }}>
              NATA (National Aptitude Test in Architecture) ஆன்லைன் கோச்சிங் என்பது அனுபவம் வாய்ந்த
              கட்டிடக்கலை ஆசிரியர்களால் வீடியோ வழியாக நேரடியாக நடத்தப்படும் கட்டமைக்கப்பட்ட
              தயாரிப்பு. இது கணிதம், பொது அப்டிட்யூட், மற்றும் வரைபடத் தேர்வு (Drawing) ஆகிய மூன்று
              பிரிவுகளையும் உள்ளடக்கியது. வாராந்திர மாதிரி தேர்வுகள் (mock tests), வரைபடங்களுக்கு
              ஒருவருக்கொருவர் பின்னூட்டம், மற்றும் தினசரி வரைதல் பயிற்சியும் சேர்க்கப்பட்டுள்ளன.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.9, color: 'text.secondary', fontSize: '1.05rem' }}>
              நேராம் கிளாஸஸ் (Neram Classes) NIT, IIT, SPA முன்னாள் மாணவர்கள் ஆசிரியர்களாக 25 மாணவர்கள்
              கொண்ட சிறிய பேட்ச்களில் கற்பிக்கின்றனர். 2009 முதல் 10,000க்கும் மேற்பட்ட
              மாணவர்களுக்குப் பயிற்சி அளித்து 99.9% வெற்றி விகிதத்துடன் தமிழ்நாடு உட்பட 150+
              நகரங்களில் இருந்து மாணவர்களுக்கு சேவை வழங்குகிறோம்.
            </Typography>
          </Container>
        </Box>

        {/* Why us, in Tamil */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              ஏன் தமிழ்நாட்டு மாணவர்கள் நேராம் கிளாஸஸைத் தேர்வு செய்கிறார்கள்
            </Typography>
            <Grid container spacing={3}>
              {[
                { title: 'நேரடி வகுப்புகள்', body: 'பதிவுசெய்யப்பட்ட வீடியோக்கள் அல்ல, உண்மையான நேரடி வகுப்புகள். கேள்விகள் கேட்கவும் உடனடி பின்னூட்டம் பெறவும் முடியும்.' },
                { title: 'NIT, IIT, SPA ஆசிரியர்கள்', body: 'அனைத்து ஆசிரியர்களும் NIT, IIT அல்லது SPA முன்னாள் மாணவர்கள். 10+ வருட பயிற்சி அனுபவம்.' },
                { title: 'சிறிய பேட்ச் (அதிகபட்சம் 25)', body: 'ஒவ்வொரு பேட்சும் 25 மாணவர்களுக்கு மேல் கிடையாது. ஒவ்வொரு மாணவருக்கும் தனிப்பட்ட கவனிப்பு.' },
                { title: 'தினசரி வரைபடப் பயிற்சி', body: '2 மணி நேரம் தினசரி வரைபடப் பயிற்சி, ஆசிரியர் நேரடி பின்னூட்டம் மற்றும் விரிவான மதிப்பாய்வுடன்.' },
                { title: '100+ மாதிரித் தேர்வுகள்', body: 'விரிவான செயல்திறன் பகுப்பாய்வு, பகுதி வாரியான மதிப்பெண் முறை, மற்றும் முன்னேற்ற குறிப்புகளுடன்.' },
                { title: 'தமிழில் கற்பிக்கப்படுகிறது', body: 'ஆங்கிலம், தமிழ், இந்தி, கன்னடம், மலையாளம் 5 மொழிகளில் கிடைக்கும். உங்கள் விருப்பப்படி தேர்வு செய்யலாம்.' },
              ].map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.title}>
                  <Card sx={{ height: '100%', p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                      {item.body}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Fees in Tamil */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA ஆன்லைன் கோச்சிங் கட்டண விவரம்
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 720, mx: 'auto' }}>
              அனைத்து தமிழ்நாட்டு மாணவர்களுக்கும் ஒரே கட்டணம். EMI மற்றும் உதவித்தொகை வாய்ப்புகள் கிடைக்கின்றன.
            </Typography>
            <Grid container spacing={3} justifyContent="center">
              {[
                { name: 'NATA கிராஷ் கோர்ஸ்', dur: '3 மாதங்கள்', price: '15,000' },
                { name: '1 வருட NATA திட்டம்', dur: '12 மாதங்கள்', price: '25,000', highlight: true },
                { name: '2 வருட NATA + JEE Paper 2', dur: '24 மாதங்கள்', price: '30,000' },
              ].map((course) => (
                <Grid item xs={12} md={4} key={course.name}>
                  <Card
                    sx={{
                      height: '100%',
                      p: 3,
                      border: course.highlight ? '2px solid' : '1px solid',
                      borderColor: course.highlight ? 'primary.main' : 'grey.300',
                    }}
                  >
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                      {course.name}
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                      ரூ. {course.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      காலம்: {course.dur} (EMI கிடைக்கும்)
                    </Typography>
                    <Button
                      variant={course.highlight ? 'contained' : 'outlined'}
                      fullWidth
                      component={Link}
                      href="/ta/apply"
                      sx={{ fontWeight: 600, minHeight: 48 }}
                    >
                      இப்போதே சேருங்கள்
                    </Button>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* FAQ in Tamil */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              அடிக்கடி கேட்கப்படும் கேள்விகள்
            </Typography>
            {faqs.map((faq) => (
              <Accordion
                key={faq.question}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>}
                  sx={{ bgcolor: 'white', minHeight: 48 }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.9 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
              உங்கள் NATA பயணத்தை இன்றே தொடங்குங்கள்
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.7 }}>
              ஒரு பேட்சில் அதிகபட்சம் 25 மாணவர்கள். உங்கள் இடத்தை இப்போதே பதிவு செய்யுங்கள்.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/ta/apply"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                இப்போதே சேருங்கள்
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/ta/demo-class"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                இலவச டெமோ
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </>
  );
}
